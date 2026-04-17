import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";
import { validateProjectAccess } from "./authHelpers";

// Called from http.ts ingest endpoint — write key already validated there.
export const ingestBatch = internalMutation({
  args: {
    events: v.array(
      v.object({
        writeKey: v.string(),
        name: v.string(),
        visitorId: v.string(),
        sessionId: v.string(),
        timestamp: v.number(),
        environment: v.optional(v.string()),
        userEmail: v.optional(v.string()),
        userName: v.optional(v.string()),
        props: v.record(v.string(), v.union(v.string(), v.number(), v.boolean())),
      }),
    ),
  },
  handler: async (ctx, args) => {
    for (const event of args.events) {
      await ctx.db.insert("events", event);
    }
  },
});

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
    props: v.record(v.string(), v.union(v.string(), v.number(), v.boolean())),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("events", args);
  },
});

export const listLatest = query({
  args: {
    writeKey: v.string(),
    limit: v.optional(v.number()),
    environment: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const project = await validateProjectAccess(ctx, args.writeKey);
    if (!project) return [];

    const limit = args.limit ?? 50;
    const rows = args.environment
      ? await ctx.db
          .query("events")
          .withIndex("by_writeKey_and_environment_and_timestamp", (q) =>
            q.eq("writeKey", args.writeKey).eq("environment", args.environment),
          )
          .order("desc")
          .take(limit)
      : await ctx.db
          .query("events")
          .withIndex("by_writeKey_and_timestamp", (q) =>
            q.eq("writeKey", args.writeKey),
          )
          .order("desc")
          .take(limit);

    return rows;
  },
});

export const topEventNames = query({
  args: {
    writeKey: v.string(),
    environment: v.optional(v.string()),
    since: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const project = await validateProjectAccess(ctx, args.writeKey);
    if (!project) return [];

    const startTime = args.since ?? Date.now() - 7 * 24 * 60 * 60 * 1000;
    const events = args.environment
      ? await ctx.db
          .query("events")
          .withIndex("by_writeKey_and_environment_and_timestamp", (q) =>
            q
              .eq("writeKey", args.writeKey)
              .eq("environment", args.environment)
              .gte("timestamp", startTime),
          )
          .order("desc")
          .take(5000)
      : await ctx.db
          .query("events")
          .withIndex("by_writeKey_and_timestamp", (q) =>
            q.eq("writeKey", args.writeKey).gte("timestamp", startTime),
          )
          .order("desc")
          .take(5000);

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

export const stats = query({
  args: {
    writeKey: v.string(),
    environment: v.optional(v.string()),
    since: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const project = await validateProjectAccess(ctx, args.writeKey);
    if (!project) return { totalEvents: 0, activeUsers: 0 };

    const startTime = args.since ?? Date.now() - 7 * 24 * 60 * 60 * 1000;
    const events = args.environment
      ? await ctx.db
          .query("events")
          .withIndex("by_writeKey_and_environment_and_timestamp", (q) =>
            q
              .eq("writeKey", args.writeKey)
              .eq("environment", args.environment)
              .gte("timestamp", startTime),
          )
          .order("desc")
          .take(10000)
      : await ctx.db
          .query("events")
          .withIndex("by_writeKey_and_timestamp", (q) =>
            q.eq("writeKey", args.writeKey).gte("timestamp", startTime),
          )
          .order("desc")
          .take(10000);

    const visitorSet = new Set(events.map((e) => e.visitorId));
    return { totalEvents: events.length, activeUsers: visitorSet.size };
  },
});

// Time-series data for trend charts. Buckets events into intervals based on
// the time range: <=7d → hourly, <=90d → daily, >90d → weekly.
export const timeSeries = query({
  args: {
    writeKey: v.string(),
    environment: v.optional(v.string()),
    since: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const project = await validateProjectAccess(ctx, args.writeKey);
    if (!project) return [];

    const now = Date.now();
    const startTime = args.since ?? now - 7 * 24 * 60 * 60 * 1000;
    const rangeDays = (now - startTime) / (24 * 60 * 60 * 1000);

    const rows = args.environment
      ? await ctx.db
          .query("events")
          .withIndex("by_writeKey_and_environment_and_timestamp", (q) =>
            q
              .eq("writeKey", args.writeKey)
              .eq("environment", args.environment)
              .gte("timestamp", startTime),
          )
          .take(10000)
      : await ctx.db
          .query("events")
          .withIndex("by_writeKey_and_timestamp", (q) =>
            q.eq("writeKey", args.writeKey).gte("timestamp", startTime),
          )
          .take(10000);

    const HOUR = 60 * 60 * 1000;
    const DAY = 24 * HOUR;
    const WEEK = 7 * DAY;
    const bucketSize = rangeDays <= 7 ? HOUR : rangeDays <= 90 ? DAY : WEEK;

    const buckets = new Map<number, number>();
    for (const r of rows) {
      const key = Math.floor(r.timestamp / bucketSize) * bucketSize;
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }

    const bucketStart = Math.floor(startTime / bucketSize) * bucketSize;
    const bucketEnd = Math.floor(now / bucketSize) * bucketSize;
    const result: { timestamp: number; count: number }[] = [];
    for (let t = bucketStart; t <= bucketEnd; t += bucketSize) {
      result.push({ timestamp: t, count: buckets.get(t) ?? 0 });
    }

    return result;
  },
});

// Snapshot of recent activity for a writeKey. Used by the /verify HTTP endpoint
// so `npx convalytics verify` can confirm events are actually landing, not just
// that the test event got accepted.
//
// Returns counts over 5m/1h/24h windows plus the last 5 events and pageviews,
// broken down by environment so callers can see which envs are reporting.
// Internal — assumes caller already validated the writeKey.
export const verifyStats = internalQuery({
  args: { writeKey: v.string() },
  handler: async (ctx, args) => {
    const now = Date.now();
    const MIN = 60 * 1000;
    const HOUR = 60 * MIN;
    const DAY = 24 * HOUR;

    // Cap lookups at 24h / 500 rows so this stays cheap under load.
    const events = await ctx.db
      .query("events")
      .withIndex("by_writeKey_and_timestamp", (q) =>
        q.eq("writeKey", args.writeKey).gte("timestamp", now - DAY),
      )
      .order("desc")
      .take(500);

    const pageviews = await ctx.db
      .query("pageviews")
      .withIndex("by_writeKey_and_timestamp", (q) =>
        q.eq("writeKey", args.writeKey).gte("timestamp", now - DAY),
      )
      .order("desc")
      .take(500);

    const countWithin = <T extends { timestamp: number }>(
      rows: T[],
      windowMs: number,
    ) => rows.filter((r) => r.timestamp >= now - windowMs).length;

    const environments = Array.from(
      new Set(
        [...events, ...pageviews]
          .map((r) => r.environment)
          .filter((e): e is string => typeof e === "string" && !!e),
      ),
    ).sort();

    return {
      now,
      events: {
        last5m: countWithin(events, 5 * MIN),
        last1h: countWithin(events, HOUR),
        last24h: events.length,
        recent: events.slice(0, 5).map((e) => ({
          name: e.name,
          timestamp: e.timestamp,
          environment: e.environment ?? null,
        })),
        lastTimestamp: events[0]?.timestamp ?? null,
      },
      pageviews: {
        last5m: countWithin(pageviews, 5 * MIN),
        last1h: countWithin(pageviews, HOUR),
        last24h: pageviews.length,
        recent: pageviews.slice(0, 5).map((p) => ({
          path: p.path,
          timestamp: p.timestamp,
          environment: p.environment ?? null,
        })),
        lastTimestamp: pageviews[0]?.timestamp ?? null,
      },
      environments,
    };
  },
});
