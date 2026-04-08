import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

const WINDOW_MS = 60_000; // 1-minute fixed windows

export const check = internalMutation({
  args: {
    key: v.string(),
    limit: v.number(),
    count: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{ allowed: boolean; remaining: number; resetAt: number }> => {
    const increment = args.count ?? 1;
    const now = Date.now();
    const window = Math.floor(now / WINDOW_MS) * WINDOW_MS;
    const resetAt = window + WINDOW_MS;

    const existing = await ctx.db
      .query("rateLimits")
      .withIndex("by_key_and_window", (q) =>
        q.eq("key", args.key).eq("window", window),
      )
      .unique();

    if (existing) {
      if (existing.count + increment > args.limit) {
        return { allowed: false, remaining: Math.max(0, args.limit - existing.count), resetAt };
      }
      await ctx.db.patch("rateLimits", existing._id, { count: existing.count + increment });
      return { allowed: true, remaining: args.limit - existing.count - increment, resetAt };
    }

    await ctx.db.insert("rateLimits", {
      key: args.key,
      window,
      count: increment,
    });
    return { allowed: true, remaining: args.limit - increment, resetAt };
  },
});

export const cleanup = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - 5 * 60_000;
    const docs = await ctx.db.query("rateLimits").take(500);
    for (const doc of docs) {
      if (doc.window < cutoff) {
        await ctx.db.delete("rateLimits", doc._id);
      }
    }
  },
});
