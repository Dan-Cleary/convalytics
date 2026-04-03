# Convalytics — Agent Skill

Add analytics to a Convex project: web analytics (page views, sessions, bounce rate) + product analytics (event tracking from mutations/actions).

## When to use this skill

Use when the user asks to:
- Add analytics / event tracking to a Convex project
- Track user signups, purchases, feature usage, or other product events
- Set up page view analytics
- Integrate Convalytics

## Prerequisites

- A Convex project (has `convex/` directory and `convex` in dependencies)
- Authenticated with Convex (`npx convex dev` has been run before — this is already the case if the project is actively being developed)
- No Convalytics account or write key needed — the CLI auto-provisions one

---

## First: ask the user what they want

Convalytics has two products. Ask the user before starting:

- **(A) Web analytics only** — automatic page views, sessions, bounce rate, referrers. Just a script tag, no Convex component needed.
- **(B) Web analytics + product analytics** — everything in A, plus custom event tracking from mutations/actions (signups, payments, feature usage).

If the user only wants web analytics, skip the event discovery and instrumentation steps below.

---

## Workflow

### 1. Install

Run the CLI. No write key required — it auto-provisions a project and returns a claim link for the human:

```bash
npx convalytics init
```

If the user already has a write key, pass it directly:

```bash
npx convalytics init YOUR_WRITE_KEY
```

This handles: package install, config patching, env var, browser script tag, and agent skill file.

The CLI outputs a **claim URL** — share it with the user so they can connect the project to their Convalytics account. Events flow immediately, before claiming.

If `index.html` wasn't found (Next.js, Astro, etc.), add the script tag to the `<head>` manually:
```html
<script defer src="https://YOUR_CONVEX_SITE_URL/script.js?key=YOUR_WRITE_KEY"></script>
```
- Next.js: add to `app/layout.tsx` or use `next/script` with `strategy="afterInteractive"`
- Astro: add to your base layout

**If the user chose (A) web analytics only, you're done.** Share the claim URL and stop here.

### 2. Discover what to track (option B only)

Read `convex/schema.ts` and every file in `convex/` to understand the data model and business logic. Identify every mutation and action that represents a meaningful user action.

Propose a tracking plan as a numbered list. For each event include:
- **Event name** — `snake_case`, `noun_verb` format (e.g. `user_signed_up`)
- **File** — which file contains the mutation/action
- **Function** — which exported function to instrument
- **Props** — what metadata to attach (pulled from existing args/data)

Example output:

```
Proposed tracking plan:

1. user_signed_up — convex/users.ts → createUser — props: { plan }
2. subscription_started — convex/billing.ts → createSubscription — props: { plan, interval }
3. payment_succeeded — convex/stripe.ts → handleWebhook (invoice.payment_succeeded) — props: { amount, currency }
4. message_sent — convex/messages.ts → sendMessage — props: { channel }
5. file_uploaded — convex/storage.ts → uploadFile — props: { fileType, sizeBytes }
```

Guidelines:
- Prefix AI-related events with `ai_` (e.g. `ai_completion_requested`)
- Don't over-track. Aim for 5–15 events that capture the core user journey.
- Skip internal/admin/migration functions
- Skip read-only queries — only track mutations and actions that represent user intent

**Wait for the user to approve the plan before instrumenting.**

### 3. Instrument approved events

For each approved event, add a tracking call right after the core logic:

```typescript
import { analytics } from "./analytics";

export const createUser = mutation({
  args: { name: v.string(), email: v.string(), plan: v.string() },
  handler: async (ctx, args) => {
    const userId = await ctx.db.insert("users", args);
    await analytics.track(ctx, {
      name: "user_signed_up",
      userId: String(userId),
      props: { plan: args.plan },
    });
    return userId;
  },
});
```

### 4. Verify

```bash
npx convalytics verify YOUR_WRITE_KEY
```

---

## Manual setup (if CLI isn't available)

**1. Install the package**
```bash
npm install @convalytics/convex
```

**2. Register the component** in `convex/convex.config.ts` (create if missing):
```typescript
import { defineApp } from "convex/server";
import analytics from "@convalytics/convex/convex.config";

const app = defineApp();
app.use(analytics);

export default app;
```

**3. Create the singleton** at `convex/analytics.ts`:
```typescript
import { components } from "./_generated/api";
import { Convalytics } from "@convalytics/convex";

export const analytics = new Convalytics(components.convalytics, {
  writeKey: process.env.CONVALYTICS_WRITE_KEY!,
});
```

**4. Set the environment variable**
```bash
npx convex env set CONVALYTICS_WRITE_KEY YOUR_WRITE_KEY
```

**5. Add browser page view tracking** to your HTML `<head>`:
```html
<script defer src="https://YOUR_CONVEX_SITE_URL/script.js?key=YOUR_WRITE_KEY"></script>
```

---

## track() API

```typescript
await analytics.track(ctx, {
  name: string,       // required — event name in snake_case
  userId: string,     // required — stable identifier for the user
  sessionId?: string, // optional — auto-generated if omitted
  timestamp?: number, // optional — unix ms, defaults to Date.now()
  props?: Record<string, string | number | boolean>, // optional metadata
});
```

- Works from any `mutation` or `action`
- Never throws — analytics failures are logged but never propagate
- Events appear in the Convalytics dashboard within seconds

---

## Common patterns

**After a state change:**
```typescript
await analytics.track(ctx, {
  name: "subscription_upgraded",
  userId: args.userId,
  props: { from: currentPlan, to: args.newPlan },
});
```

**In a Stripe webhook action:**
```typescript
if (event.type === "invoice.payment_succeeded") {
  await analytics.track(ctx, {
    name: "payment_succeeded",
    userId: event.data.object.customer,
    props: { amount: event.data.object.amount_paid, currency: event.data.object.currency },
  });
}
```

**AI feature usage:**
```typescript
await analytics.track(ctx, {
  name: "ai_message_sent",
  userId: String(userId),
  props: { model: "gpt-4o", tokens: completionTokens, feature: "chat" },
});
```

---

## Troubleshooting

**Events not appearing:**
- Check `CONVALYTICS_WRITE_KEY` is set: `npx convex env list`
- Check Convex function logs for `[Convalytics]` errors
- Re-run verify: `npx convalytics verify YOUR_WRITE_KEY`

**TypeScript errors on `analytics.track`:**
- Make sure `convex/convex.config.ts` registers the component with `app.use(analytics)`
- Run `npx convex dev` to regenerate `_generated/` types

**`components.convalytics` not found:**
- The component must be registered in `convex/convex.config.ts` before `convex dev` generates types
