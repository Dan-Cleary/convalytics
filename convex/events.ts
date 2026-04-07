import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { validateProjectAccess } from "./authHelpers";
import { filterByEnv } from "./envFilter";

// Called from http.ts ingest endpoint — write key already validated there.
export const ingest = internalMutation({
  args: {
    writeKey: v.string(),
    name: v.string(),
    visitorId: v.string(),
    sessionId: v.string(),
    timestamp: v.number(),
    environment: v.optional(v.string()),
    userEmail: v.optional(v.string()),
    userName: v.optional(v.string()),
    props: v.record(
      v.string(),
      v.union(v.string(), v.number(), v.boolean()),
    ),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("events", args);
  },
});

export const listLatest = query({
  args: {
    sessionToken: v.string(),
    writeKey: v.string(),
    limit: v.optional(v.number()),
    environment: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const project = await validateProjectAccess(ctx, args.sessionToken, args.writeKey);
    if (!project) return [];

    const limit = args.limit ?? 50;
    const allRows = await ctx.db
      .query("events")
      .withIndex("by_writeKey_and_timestamp", (q) =>
        q.eq("writeKey", args.writeKey),
      )
      .order("desc")
      .take(limit * 3);

    return filterByEnv(allRows, args.environment).slice(0, limit);
  },
});

export const topEventNames = query({
  args: {
    sessionToken: v.string(),
    writeKey: v.string(),
    environment: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const project = await validateProjectAccess(ctx, args.sessionToken, args.writeKey);
    if (!project) return [];

    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const events = filterByEnv(
      await ctx.db
        .query("events")
        .withIndex("by_writeKey_and_timestamp", (q) =>
          q.eq("writeKey", args.writeKey).gte("timestamp", sevenDaysAgo),
        )
        .take(5000),
      args.environment,
    );

    const counts = new Map<string, number>();
    for (const event of events) {
      counts.set(event.name, (counts.get(event.name) ?? 0) + 1);
    }

    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }));
  },
});

export const stats7d = query({
  args: {
    sessionToken: v.string(),
    writeKey: v.string(),
    environment: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const project = await validateProjectAccess(ctx, args.sessionToken, args.writeKey);
    if (!project) return { totalEvents: 0, activeUsers: 0 };

    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const events = filterByEnv(
      await ctx.db
        .query("events")
        .withIndex("by_writeKey_and_timestamp", (q) =>
          q.eq("writeKey", args.writeKey).gte("timestamp", sevenDaysAgo),
        )
        .take(10000),
      args.environment,
    );

    const visitorSet = new Set(events.map((e) => e.visitorId));
    return { totalEvents: events.length, activeUsers: visitorSet.size };
  },
});
