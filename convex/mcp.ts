/**
 * MCP tool handlers — internal queries called by POST /mcp in http.ts after
 * the inbound API token is validated and the team's plan gate has been
 * enforced. Handlers trust their callers: they do not re-check identity or
 * plan.
 *
 * Each exported query corresponds to one MCP tool exposed via tools/list +
 * tools/call. Keep logic close to the equivalent public dashboard query so
 * the numbers an agent reports over MCP match what users see in the UI.
 */

import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { PlanId, PLANS } from "./plans";

const DEFAULT_SINCE_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const MAX_SCAN = 10_000;

function clampLimit(
  limit: number | undefined,
  def = DEFAULT_LIMIT,
  max = MAX_LIMIT,
): number {
  if (!limit || limit <= 0) return def;
  return Math.min(limit, max);
}

function resolveRange(args: {
  since?: number;
  until?: number;
}): { since: number; until: number } {
  const until = args.until ?? Date.now();
  const since = args.since ?? until - DEFAULT_SINCE_MS;
  return { since, until };
}

function monthKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Tool handlers
// ---------------------------------------------------------------------------

/** list_projects — all projects on the token's team. */
export const listProjects = internalQuery({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => {
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_teamId", (q) => q.eq("teamId", args.teamId))
      .collect();
    return projects.map((p) => ({
      id: p._id,
      name: p.name,
      writeKey: p.writeKey,
      siteUrl: p.siteUrl ?? null,
      convexDeploymentSlug: p.convexDeploymentSlug ?? null,
      claimed: p.claimed ?? true,
    }));
  },
});

/** get_usage — current month's events, quota, retention for the token's team. */
export const getUsage = internalQuery({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => {
    const team = await ctx.db.get("teams", args.teamId);
    if (!team) return null;

    const plan = (team.plan ?? "free") as PlanId;
    const limit =
      team.usageLimitEventsPerMonth ??
      PLANS[plan]?.eventsPerMonth ??
      PLANS.free.eventsPerMonth;
    const currentMonth = monthKey();
    const usage =
      team.usageMonthKey === currentMonth
        ? (team.usageEventsThisMonth ?? 0)
        : 0;

    return {
      plan,
      usage,
      limit,
      retentionDays: PLANS[plan]?.retentionDays ?? PLANS.free.retentionDays,
      hasStripeSubscription: !!team.stripeSubscriptionId,
    };
  },
});

/** top_pages — page views ranked by count in the given window. */
export const topPages = internalQuery({
  args: {
    writeKey: v.string(),
    since: v.optional(v.number()),
    until: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { since, until } = resolveRange(args);
    const cap = clampLimit(args.limit, 20, 50);

    const rows = await ctx.db
      .query("pageviews")
      .withIndex("by_writeKey_and_timestamp", (q) =>
        q.eq("writeKey", args.writeKey).gte("timestamp", since),
      )
      .order("desc")
      .take(MAX_SCAN);

    const bounded = rows.filter((r) => r.timestamp <= until);

    const pageMap = new Map<
      string,
      { views: number; visitors: Set<string> }
    >();
    for (const r of bounded) {
      const entry = pageMap.get(r.path) ?? {
        views: 0,
        visitors: new Set<string>(),
      };
      entry.views++;
      entry.visitors.add(r.visitorId);
      pageMap.set(r.path, entry);
    }

    const totalViews = bounded.length || 1;
    const pages = [...pageMap.entries()]
      .sort((a, b) => b[1].views - a[1].views)
      .slice(0, cap)
      .map(([path, { views, visitors }]) => ({
        path,
        views,
        uniqueVisitors: visitors.size,
        percentage: Math.round((views / totalViews) * 100),
      }));

    return { since, until, totalViewsScanned: bounded.length, pages };
  },
});

/** top_referrers — referring hosts ranked by visits. */
export const topReferrers = internalQuery({
  args: {
    writeKey: v.string(),
    since: v.optional(v.number()),
    until: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { since, until } = resolveRange(args);
    const cap = clampLimit(args.limit, 10, 50);

    const rows = await ctx.db
      .query("pageviews")
      .withIndex("by_writeKey_and_timestamp", (q) =>
        q.eq("writeKey", args.writeKey).gte("timestamp", since),
      )
      .order("desc")
      .take(MAX_SCAN / 2);

    const bounded = rows.filter((r) => r.timestamp <= until);

    const refMap = new Map<string, number>();
    for (const r of bounded) {
      const host = r.referrerHost || "(direct)";
      refMap.set(host, (refMap.get(host) ?? 0) + 1);
    }

    const referrers = [...refMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, cap)
      .map(([source, visits]) => ({ source, visits }));

    return { since, until, referrers };
  },
});

/** events_count — custom event count, optionally filtered by event name. */
export const eventsCount = internalQuery({
  args: {
    writeKey: v.string(),
    name: v.optional(v.string()),
    since: v.optional(v.number()),
    until: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { since, until } = resolveRange(args);

    const rows = await ctx.db
      .query("events")
      .withIndex("by_writeKey_and_timestamp", (q) =>
        q.eq("writeKey", args.writeKey).gte("timestamp", since),
      )
      .order("desc")
      .take(MAX_SCAN);

    const bounded = rows.filter((r) => r.timestamp <= until);
    const filtered = args.name
      ? bounded.filter((r) => r.name === args.name)
      : bounded;

    const uniqueVisitors = new Set(filtered.map((r) => r.visitorId)).size;

    return {
      name: args.name ?? null,
      since,
      until,
      count: filtered.length,
      uniqueVisitors,
      truncated: rows.length >= MAX_SCAN,
    };
  },
});

/** recent_events — last N events, optionally filtered by name, with optional prop redaction for PII. */
export const recentEvents = internalQuery({
  args: {
    writeKey: v.string(),
    name: v.optional(v.string()),
    limit: v.optional(v.number()),
    redact: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const cap = clampLimit(args.limit, 20, 100);
    const redact = args.redact ?? true;

    // Filtering by name post-scan — index doesn't include name. For MVP this
    // is fine; optimize with a name index if agents use this heavily.
    const scanSize = args.name ? MAX_SCAN : cap;
    const rows = await ctx.db
      .query("events")
      .withIndex("by_writeKey_and_timestamp", (q) =>
        q.eq("writeKey", args.writeKey),
      )
      .order("desc")
      .take(scanSize);

    const filtered = (
      args.name ? rows.filter((r) => r.name === args.name) : rows
    ).slice(0, cap);

    return filtered.map((r) => ({
      id: r._id,
      name: r.name,
      timestamp: r.timestamp,
      environment: r.environment ?? null,
      visitorId: r.visitorId,
      sessionId: r.sessionId,
      userEmail: redact ? null : (r.userEmail ?? null),
      userName: redact ? null : (r.userName ?? null),
      props: redact ? {} : r.props,
    }));
  },
});
