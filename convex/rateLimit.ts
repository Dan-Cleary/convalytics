import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

const WINDOW_MS = 60_000; // 1-minute fixed windows

export const check = internalMutation({
  args: {
    key: v.string(),
    limit: v.number(),
  },
  handler: async (ctx, args): Promise<boolean> => {
    const now = Date.now();
    const window = Math.floor(now / WINDOW_MS) * WINDOW_MS;

    const existing = await ctx.db
      .query("rateLimits")
      .withIndex("by_key_and_window", (q) =>
        q.eq("key", args.key).eq("window", window),
      )
      .unique();

    if (existing) {
      if (existing.count >= args.limit) {
        return false;
      }
      await ctx.db.patch("rateLimits", existing._id, { count: existing.count + 1 });
      return true;
    }

    await ctx.db.insert("rateLimits", {
      key: args.key,
      window,
      count: 1,
    });
    return true;
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
