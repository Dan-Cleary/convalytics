# @convalytics/convex

Server-side analytics for Convex apps. Track events reliably from mutations and actions — never blocked by ad blockers, never dropped on page unload.

Pairs with the Convalytics browser script for full-stack analytics: web traffic + server-side product events in one dashboard.

## Install

```bash
npm install @convalytics/convex
```

## Setup

### 1. Register the component

Add to `convex/convex.config.ts` (create it if it doesn't exist):

```typescript
import { defineApp } from "convex/server";
import analytics from "@convalytics/convex/convex.config";

const app = defineApp();
app.use(analytics);

export default app;
```

### 2. Create an analytics singleton

Create `convex/analytics.ts`:

```typescript
import { components } from "./_generated/api";
import { Convalytics } from "@convalytics/convex";

export const analytics = new Convalytics(components.convalytics, {
  writeKey: process.env.CONVALYTICS_WRITE_KEY!,
});
```

### 3. Set your write key

Add to your Convex environment variables (via the Convex dashboard or CLI):

```bash
npx convex env set CONVALYTICS_WRITE_KEY your_write_key_here
```

Get your write key from the [Convalytics dashboard](https://convalytics.dev).

### 4. Configure once

Call `analytics.configure(ctx)` once at startup. Add this to a setup mutation or run it from an init action:

```typescript
import { internalMutation } from "./_generated/server";
import { analytics } from "./analytics";

export const setup = internalMutation({
  args: {},
  handler: async (ctx) => {
    await analytics.configure(ctx);
  },
});
```

Run it once:
```bash
npx convex run --prod setup
```

## Usage

### Track events from mutations

```typescript
import { mutation } from "./_generated/server";
import { v } from "convex/values";
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

### Track events from actions

```typescript
import { httpAction } from "./_generated/server";
import { analytics } from "./analytics";

export const stripeWebhook = httpAction(async (ctx, req) => {
  const event = await req.json() as { type: string; data: { object: { customer: string; amount_paid: number } } };

  if (event.type === "invoice.payment_succeeded") {
    await analytics.track(ctx, {
      name: "subscription_renewed",
      userId: event.data.object.customer,
      props: { amount: event.data.object.amount_paid },
    });
  }

  return new Response(null, { status: 200 });
});
```

## API

### `new Convalytics(component, options)`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `writeKey` | `string` | Yes | Your Convalytics project write key |
| `ingestUrl` | `string` | No | Override ingest endpoint (for local dev) |

### `analytics.configure(ctx)`

Stores config in the component's database. Call once on deploy. Safe to call repeatedly — upserts.

### `analytics.track(ctx, event)`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | Yes | Event name (e.g. `"user_signed_up"`) |
| `userId` | `string` | Yes | Stable user identifier |
| `sessionId` | `string` | No | Session ID (auto-generated if omitted) |
| `timestamp` | `number` | No | Unix ms timestamp (defaults to `Date.now()`) |
| `props` | `Record<string, string \| number \| boolean>` | No | Additional properties |

Events are delivered asynchronously and never throw — analytics failures are logged but never propagate to the caller.

## Web analytics

For browser page view tracking, add to your `<head>`:

```html
<script defer src="https://peaceful-bobcat-731.convex.site/script.js?key=YOUR_WRITE_KEY"></script>
```

## Quick setup via CLI

```bash
npx convalytics init
```

Installs the package, patches `convex.config.ts`, creates `convex/analytics.ts`, and inserts the script tag automatically.
