import { internalQuery } from "./_generated/server";
import { v } from "convex/values";

/**
 * Cheapest possible DB touch — used by /health for uptime monitoring.
 * Runs a bounded query that doesn't depend on any specific rows existing.
 */
export const ping = internalQuery({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    // take(1) is O(1) and returns [] if the table is empty, so it works
    // even on a fresh deployment. We don't care about the result — we only
    // care that the query completes without throwing.
    await ctx.db.query("projects").take(1);
    return null;
  },
});
