# Convalytics — Convex Component

This project uses `@convalytics/convex` for server-side analytics.

## Tracking events

Import the singleton from `convex/analytics.ts`:

```typescript
import { analytics } from "./analytics";
```

Track from any mutation or action:

```typescript
await analytics.track(ctx, {
  name: "event_name",       // snake_case, required
  userId: String(userId),   // stable user ID, required
  props: { key: "value" },  // optional key/value metadata
});
```

## Common patterns

**After inserting a record:**
```typescript
const userId = await ctx.db.insert("users", args);
await analytics.track(ctx, { name: "user_created", userId: String(userId) });
```

**After a state change:**
```typescript
await ctx.db.patch(subscriptionId, { status: "active" });
await analytics.track(ctx, {
  name: "subscription_activated",
  userId: args.userId,
  props: { plan: args.plan, interval: args.interval },
});
```

**In a webhook action:**
```typescript
await analytics.track(ctx, {
  name: "payment_succeeded",
  userId: customerId,
  props: { amount: amountCents, currency: "usd" },
});
```

## Configuration

The write key is stored in `CONVALYTICS_WRITE_KEY` environment variable.

Set it via Convex dashboard or:
```bash
npx convex env set CONVALYTICS_WRITE_KEY your_key_here
```

If events aren't showing up in the dashboard, run the setup mutation:
```bash
npx convex run --prod setup  # or whatever your configure mutation is named
```

## Verify events are flowing

1. Open the [Convalytics dashboard](https://convalytics.dev)
2. Navigate to Custom Events
3. Events appear within a few seconds of being tracked

## Event naming conventions

- Use `snake_case`
- Format: `noun_verb` — e.g. `user_signed_up`, `subscription_canceled`, `payment_failed`
- Prefix AI-related events with `ai_` — e.g. `ai_completion_requested`
