---
title: How to add analytics to a Convex app in 10 minutes
description: A working setup for page views, custom events, and user identification on a Convex + React app, using the Convex backend component so the write key never ships to the browser.
date: 2026-04-29
tags: convex, analytics, tutorial
heroImage: /blog/add-analytics-hero.jpg
---

I've been building on Convex for a while. Every new project hit the same wall when it was time to add analytics.

Two options, both bad:

1. Roll your own events table in Convex and build a dashboard.
2. Bolt on PostHog or Amplitude. Overkill for what I actually wanted.

I just wanted something simple. So I built [Convalytics](https://convalytics.dev). This post is how I wire it up on a new Convex app. Ten minutes start to finish.

## What you'll have when this is done

- Page views captured on every route, with referrer + UTM (aka Google Analytics, but for your Convex app)
- A `track()` you can call from any Convex mutation, action, or scheduled function
- A dashboard at convalytics.dev showing it live
- An MCP server for querying the data from Claude Desktop, Cursor, Windsurf, or any MCP-capable agent

## The fastest path: paste a prompt

If you don't want to read the rest of this, the homepage at [convalytics.dev](https://convalytics.dev) has a **Copy agent prompt** button. Copy it, paste it into Claude Code, Cursor, or any AI coding agent, and it does the install for you. Page views, the Convex component, the env var, and the first event get wired up while you make coffee.

Or just copy the prompt right here:

<details>
<summary><strong>Show the prompt</strong></summary>

<button data-copy-target="agent-prompt" class="copy-btn" type="button">Copy prompt</button>

<pre id="agent-prompt">Add Convalytics analytics to this Convex project.

Before starting, ask me: do I want (A) web analytics only — automatic page views,
sessions, bounce rate, referrers — or (B) web analytics + product analytics
for signups, payments, feature usage, etc.?

## Option A — Web analytics only

Run: npx convalytics init

This provisions a project and adds a script tag to index.html. That's it — page
views start flowing immediately. No SDK or component needed.

For non-Vite projects (Next.js, Astro, etc.), the CLI prints the script tag to
add manually to <head>.

Share the claim URL from the output with me.

## Option B — Web analytics + product analytics

Run: npx convalytics init

Same as above, plus it installs the Convex component for tracking custom events
from mutations and actions.

After install, read convex/schema.ts and all files in convex/. Identify every
mutation and action that represents a meaningful user action. Propose a tracking
plan as a numbered list:

  1. event_name — file.ts → functionName — props: { key }

Wait for me to approve, then instrument each with:

  import { analytics } from "./analytics";
  await analytics.track(ctx, { name: "event_name", userId: String(userId), props: { key: "value" } });

Then verify: npx convalytics verify

Share the claim URL from the output with me.</pre>

</details>

The rest of this post is the manual reference, in case you want to know exactly what the agent's about to do (or you don't use a coding agent).

## 1. Provision a project

```
npx convalytics init
```

That hits `POST /api/provision`, gets a write key back, and writes it to your `.env.local`. The project is unclaimed. You can link it to a Convalytics account later from the URL the CLI prints. No signup needed first.

## 2. Drop in the browser script

Page views are free and uncounted against quota. The script is the easiest path:

```html
<script src="https://api.convalytics.dev/script.js?key=YOUR_WRITE_KEY" defer></script>
```

That captures every route change automatically. Convalytics hooks `pushState` and `popstate`, so SPAs work without extra config. Open your dashboard, click around your app, and hits start landing.

## 3. Install the Convex backend component

Custom events from server functions are the more interesting ones. You know who triggered them, you can attach Convex IDs as props, and the write key never touches the browser.

If you used the agent prompt above, this is already done. The agent reads your `convex/schema.ts`, scans every mutation and action, and proposes a tracking plan as a numbered list before instrumenting anything. You either approve, edit, or just say "track everything that touches the users table."

```
npm i @convalytics/convex-component
```

Register it in `convex/convex.config.ts`:

```ts
import { defineApp } from "convex/server";
import convalytics from "@convalytics/convex-component/convex.config";

const app = defineApp();
app.use(convalytics);
export default app;
```

Set the write key as a Convex env var:

```
npx convex env set CONVALYTICS_WRITE_KEY wk_...
```

## 4. Track an event from a mutation

In any Convex mutation, action, or scheduled function:

```ts
import { internal } from "./_generated/api";
import { mutation } from "./_generated/server";

export const completeSignup = mutation({
  args: { /* ... */ },
  handler: async (ctx, args) => {
    const userId = await ctx.db.insert("users", { /* ... */ });

    await ctx.runAction(internal.convalytics.track, {
      name: "signup_completed",
      userId,
      props: { plan: "free", source: args.referrer },
    });

    return userId;
  },
});
```

That's the whole integration. The component batches events server-side and posts them to ingest. Your write key never reaches the browser.

## 5. Identify users so the dashboard shows names

By default an event row stores a `userId` like `j5742w...`. Useful for joining, useless for skimming the User Activity tab. Pass the user's email and name and the dashboard shows the actual person, lets you filter by email, and lets the MCP tool answer "how is alice@acme.com using the app?" instead of asking which Convex ID belongs to Alice.

Server-side, pass `userEmail` and `userName` to `track()`:

```ts
await ctx.runAction(internal.convalytics.track, {
  name: "feature_used",
  userId: user._id,
  userEmail: user.email,
  userName: user.name,
  props: { feature: "export_csv" },
});
```

If you want browser-emitted events tied to the same user, call `identify()` once after sign-in:

```js
window.convalytics.identify(userId, { email, name });
```

And `convalytics.reset()` on logout so the next visitor doesn't inherit the previous session.

## 6. Bonus: query it from Claude

Convalytics ships an MCP server. You can ask Claude Desktop or Claude Code things like *"how many signups this week on my Convex app?"* and it answers.

```
claude mcp add --transport http convalytics https://api.convalytics.dev/mcp \
  --header "Authorization: Bearer $CONVALYTICS_TOKEN"
```

Generate the token at [convalytics.dev/tokens](https://convalytics.dev/tokens). The MCP endpoint requires the Solo plan ($29/mo) or higher. Dashboard and ingest API stay free.

## What you didn't have to do

- No service-account JSON or principal setup. The write key is the credential.
- No data warehouse to provision. Convex hosts the events.
- No `<script>` in the bundle leaking a service role key. The component sends from your Convex deployment.
- No 30-page SDK manual. The whole API is `track()` and `identify()`.

Ten minutes to live analytics. Two of those were `npm install`.

What's the next thing you'd want it to do? [Tell me on X](https://x.com/DanJCleary).
