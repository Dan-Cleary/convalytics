import { internalMutation, query } from "./_generated/server";
import { v } from "convex/values";
import { validateProjectAccess } from "./authHelpers";

// Called from http.ts ingest endpoint — write key already validated there.
export const ingestBatch = internalMutation({
  args: {
    pageviews: v.array(
      v.object({
        writeKey: v.string(),
        visitorId: v.string(),
        sessionId: v.string(),
        timestamp: v.number(),
        environment: v.optional(v.string()),
        userEmail: v.optional(v.string()),
        userName: v.optional(v.string()),
        path: v.string(),
        referrer: v.string(),
        referrerHost: v.string(),
        title: v.string(),
        utm_source: v.optional(v.string()),
        utm_medium: v.optional(v.string()),
        utm_campaign: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    for (const pv of args.pageviews) {
      await ctx.db.insert("pageviews", pv);
    }
  },
});

export const ingest = internalMutation({
  args: {
    writeKey: v.string(),
    visitorId: v.string(),
    sessionId: v.string(),
    timestamp: v.number(),
    environment: v.optional(v.string()),
    userEmail: v.optional(v.string()),
    userName: v.optional(v.string()),
    path: v.string(),
    referrer: v.string(),
    title: v.string(),
    utm_source: v.optional(v.string()),
    utm_medium: v.optional(v.string()),
    utm_campaign: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let referrerHost = "";
    if (args.referrer) {
      try {
        referrerHost = new URL(args.referrer).hostname.slice(0, 200);
      } catch {
        // Invalid URL, leave referrerHost empty
      }
    }
    await ctx.db.insert("pageviews", { ...args, referrerHost });
  },
});

export const stats = query({
  args: {
    sessionToken: v.string(),
    writeKey: v.string(),
    environment: v.optional(v.string()),
    since: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const project = await validateProjectAccess(
      ctx,
      args.sessionToken,
      args.writeKey,
    );
    if (!project) return null;

    const startTime = args.since ?? Date.now() - 7 * 24 * 60 * 60 * 1000;
    const rows = args.environment
      ? await ctx.db
          .query("pageviews")
          .withIndex("by_writeKey_and_environment_and_timestamp", (q) =>
            q
              .eq("writeKey", args.writeKey)
              .eq("environment", args.environment)
              .gte("timestamp", startTime),
          )
          .order("desc")
          .take(10000)
      : await ctx.db
          .query("pageviews")
          .withIndex("by_writeKey_and_timestamp", (q) =>
            q.eq("writeKey", args.writeKey).gte("timestamp", startTime),
          )
          .order("desc")
          .take(10000);

    const pageViews = rows.length;
    const uniqueVisitors = new Set(rows.map((r) => r.visitorId)).size;
    const sessionSet = new Set(rows.map((r) => r.sessionId));
    const sessions = sessionSet.size;

    const sessionCounts = new Map<string, number>();
    for (const r of rows) {
      sessionCounts.set(r.sessionId, (sessionCounts.get(r.sessionId) ?? 0) + 1);
    }
    const bounced = [...sessionCounts.values()].filter((c) => c === 1).length;
    const bounceRate =
      sessions > 0 ? Math.round((bounced / sessions) * 100) : 0;

    return { pageViews, uniqueVisitors, sessions, bounceRate };
  },
});

export const topPages = query({
  args: {
    sessionToken: v.string(),
    writeKey: v.string(),
    environment: v.optional(v.string()),
    since: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const project = await validateProjectAccess(
      ctx,
      args.sessionToken,
      args.writeKey,
    );
    if (!project) return [];

    const startTime = args.since ?? Date.now() - 7 * 24 * 60 * 60 * 1000;
    const rows = args.environment
      ? await ctx.db
          .query("pageviews")
          .withIndex("by_writeKey_and_environment_and_timestamp", (q) =>
            q
              .eq("writeKey", args.writeKey)
              .eq("environment", args.environment)
              .gte("timestamp", startTime),
          )
          .order("desc")
          .take(10000)
      : await ctx.db
          .query("pageviews")
          .withIndex("by_writeKey_and_timestamp", (q) =>
            q.eq("writeKey", args.writeKey).gte("timestamp", startTime),
          )
          .order("desc")
          .take(10000);

    const pageMap = new Map<string, { views: number; visitors: Set<string> }>();
    for (const r of rows) {
      const entry = pageMap.get(r.path) ?? { views: 0, visitors: new Set() };
      entry.views++;
      entry.visitors.add(r.visitorId);
      pageMap.set(r.path, entry);
    }

    const total = rows.length || 1;
    return [...pageMap.entries()]
      .sort((a, b) => b[1].views - a[1].views)
      .slice(0, 20)
      .map(([path, { views, visitors }]) => ({
        path,
        views,
        uniqueVisitors: visitors.size,
        percentage: Math.round((views / total) * 100),
      }));
  },
});

export const topSources = query({
  args: {
    sessionToken: v.string(),
    writeKey: v.string(),
    environment: v.optional(v.string()),
    since: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const project = await validateProjectAccess(
      ctx,
      args.sessionToken,
      args.writeKey,
    );
    if (!project) return { referrers: [], campaigns: [] };

    const startTime = args.since ?? Date.now() - 7 * 24 * 60 * 60 * 1000;
    const rows = args.environment
      ? await ctx.db
          .query("pageviews")
          .withIndex("by_writeKey_and_environment_and_timestamp", (q) =>
            q
              .eq("writeKey", args.writeKey)
              .eq("environment", args.environment)
              .gte("timestamp", startTime),
          )
          .order("desc")
          .take(5000)
      : await ctx.db
          .query("pageviews")
          .withIndex("by_writeKey_and_timestamp", (q) =>
            q.eq("writeKey", args.writeKey).gte("timestamp", startTime),
          )
          .order("desc")
          .take(5000);

    const referrerMap = new Map<string, number>();
    const campaignMap = new Map<string, number>();

    for (const r of rows) {
      const host = r.referrerHost || "(direct)";
      referrerMap.set(host, (referrerMap.get(host) ?? 0) + 1);

      if (r.utm_source) {
        const key = r.utm_campaign
          ? `${r.utm_source} / ${r.utm_campaign}`
          : r.utm_source;
        campaignMap.set(key, (campaignMap.get(key) ?? 0) + 1);
      }
    }

    const referrers = [...referrerMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([source, visits]) => ({ source, visits }));

    const campaigns = [...campaignMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([campaign, visits]) => ({ campaign, visits }));

    return { referrers, campaigns };
  },
});

export const realtimeVisitors = query({
  args: {
    sessionToken: v.string(),
    writeKey: v.string(),
    environment: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const project = await validateProjectAccess(
      ctx,
      args.sessionToken,
      args.writeKey,
    );
    if (!project) return 0;

    const since = Date.now() - 5 * 60 * 1000;
    const rows = args.environment
      ? await ctx.db
          .query("pageviews")
          .withIndex("by_writeKey_and_environment_and_timestamp", (q) =>
            q
              .eq("writeKey", args.writeKey)
              .eq("environment", args.environment)
              .gte("timestamp", since),
          )
          .take(500)
      : await ctx.db
          .query("pageviews")
          .withIndex("by_writeKey_and_timestamp", (q) =>
            q.eq("writeKey", args.writeKey).gte("timestamp", since),
          )
          .take(500);

    return new Set(rows.map((r) => r.visitorId)).size;
  },
});

export const listLatest = query({
  args: {
    sessionToken: v.string(),
    writeKey: v.string(),
    environment: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const project = await validateProjectAccess(
      ctx,
      args.sessionToken,
      args.writeKey,
    );
    if (!project) return [];

    const rows = args.environment
      ? await ctx.db
          .query("pageviews")
          .withIndex("by_writeKey_and_environment_and_timestamp", (q) =>
            q.eq("writeKey", args.writeKey).eq("environment", args.environment),
          )
          .order("desc")
          .take(30)
      : await ctx.db
          .query("pageviews")
          .withIndex("by_writeKey_and_timestamp", (q) =>
            q.eq("writeKey", args.writeKey),
          )
          .order("desc")
          .take(30);

    return rows.map((r) => ({
      _id: r._id,
      path: r.path,
      title: r.title,
      referrerHost: r.referrerHost,
      visitorId: r.visitorId,
      sessionId: r.sessionId,
      timestamp: r.timestamp,
      environment: r.environment,
      userEmail: r.userEmail,
      userName: r.userName,
    }));
  },
});

// Time-series data for trend charts. Buckets page views into intervals based on
// the time range: <=7d → hourly, <=90d → daily, >90d → weekly.
export const timeSeries = query({
  args: {
    sessionToken: v.string(),
    writeKey: v.string(),
    environment: v.optional(v.string()),
    since: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const project = await validateProjectAccess(
      ctx,
      args.sessionToken,
      args.writeKey,
    );
    if (!project) return [];

    const now = Date.now();
    const startTime = args.since ?? now - 7 * 24 * 60 * 60 * 1000;
    const rangeDays = (now - startTime) / (24 * 60 * 60 * 1000);

    const rows = args.environment
      ? await ctx.db
          .query("pageviews")
          .withIndex("by_writeKey_and_environment_and_timestamp", (q) =>
            q
              .eq("writeKey", args.writeKey)
              .eq("environment", args.environment)
              .gte("timestamp", startTime),
          )
          .take(10000)
      : await ctx.db
          .query("pageviews")
          .withIndex("by_writeKey_and_timestamp", (q) =>
            q.eq("writeKey", args.writeKey).gte("timestamp", startTime),
          )
          .take(10000);

    // Choose bucket size
    const HOUR = 60 * 60 * 1000;
    const DAY = 24 * HOUR;
    const WEEK = 7 * DAY;
    const bucketSize = rangeDays <= 7 ? HOUR : rangeDays <= 90 ? DAY : WEEK;

    // Bucket rows
    const buckets = new Map<number, { views: number; visitors: Set<string> }>();
    for (const r of rows) {
      const key = Math.floor(r.timestamp / bucketSize) * bucketSize;
      const b = buckets.get(key) ?? { views: 0, visitors: new Set() };
      b.views++;
      b.visitors.add(r.visitorId);
      buckets.set(key, b);
    }

    // Fill gaps so the chart has continuous data points
    const bucketStart = Math.floor(startTime / bucketSize) * bucketSize;
    const bucketEnd = Math.floor(now / bucketSize) * bucketSize;
    const result: { timestamp: number; views: number; visitors: number }[] = [];
    for (let t = bucketStart; t <= bucketEnd; t += bucketSize) {
      const b = buckets.get(t);
      result.push({
        timestamp: t,
        views: b?.views ?? 0,
        visitors: b?.visitors.size ?? 0,
      });
    }

    return result;
  },
});