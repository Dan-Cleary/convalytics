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
import type { QueryCtx } from "./_generated/server";
import { computeTeamUsage } from "./usage";

/**
 * Resolve an agent's `project` argument to a concrete writeKey bounded to
 * the caller's team. Accepts either the project's `_id` or its name
 * (case-insensitive). Used by http.ts dispatchTool before calling any
 * project-scoped MCP tool so the agent sees friendly error messages
 * (available project names) without leaking cross-team data.
 */
export const resolveProject = internalQuery({
  args: { teamId: v.id("teams"), project: v.string() },
  handler: async (ctx, args) => {
    const teamProjects = await ctx.db
      .query("projects")
      .withIndex("by_teamId", (q) => q.eq("teamId", args.teamId))
      .collect();

    const asId = ctx.db.normalizeId("projects", args.project);
    if (asId) {
      const match = teamProjects.find((p) => p._id === asId);
      if (match) {
        return {
          projectId: match._id,
          writeKey: match.writeKey,
          name: match.name,
        };
      }
    }

    const needle = args.project.toLowerCase().trim();
    const byName = teamProjects.filter(
      (p) => p.name.toLowerCase() === needle,
    );
    if (byName.length === 1) {
      return {
        projectId: byName[0]._id,
        writeKey: byName[0].writeKey,
        name: byName[0].name,
      };
    }

    const available = teamProjects.map((p) => p.name).join(", ") || "(none)";
    if (byName.length > 1) {
      throw new Error(
        `Multiple projects named "${args.project}" on this team. Pass the project id instead. Available: ${available}.`,
      );
    }
    throw new Error(
      `No project matching "${args.project}" on this team. Available projects: ${available}. Call list_projects for ids.`,
    );
  },
});

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

/**
 * Match a stored row against the `user` argument an agent passed. Emails are
 * case-insensitive (users don't think in case); visitorId is exact because
 * it's an opaque identifier. `visitorId` is what the ingest handler stores
 * the track()-time `userId` argument as — the rename happens at
 * http.ts:284.
 */
function matchesUser(
  row: { visitorId?: string; userEmail?: string },
  user: string,
): boolean {
  if (!user) return true;
  if (row.visitorId && row.visitorId === user) return true;
  if (
    row.userEmail &&
    row.userEmail.toLowerCase() === user.toLowerCase()
  )
    return true;
  return false;
}

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
  handler: async (ctx, args) => computeTeamUsage(ctx, args.teamId),
});

/** top_pages — page views ranked by count in the given window. */
export const topPages = internalQuery({
  args: {
    writeKey: v.string(),
    since: v.optional(v.number()),
    until: v.optional(v.number()),
    limit: v.optional(v.number()),
    user: v.optional(v.string()),
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

    const bounded = rows.filter(
      (r) => r.timestamp <= until && (!args.user || matchesUser(r, args.user)),
    );

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

/**
 * pageviews_count — total page views (from the browser script) in a window.
 * Page views live in a separate table from custom events, so this does not
 * overlap with events_count. Use this for "how much web traffic" questions.
 */
export const pageviewsCount = internalQuery({
  args: {
    writeKey: v.string(),
    since: v.optional(v.number()),
    until: v.optional(v.number()),
    user: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { since, until } = resolveRange(args);

    const rows = await ctx.db
      .query("pageviews")
      .withIndex("by_writeKey_and_timestamp", (q) =>
        q.eq("writeKey", args.writeKey).gte("timestamp", since),
      )
      .order("desc")
      .take(MAX_SCAN);

    const bounded = rows.filter(
      (r) => r.timestamp <= until && (!args.user || matchesUser(r, args.user)),
    );
    const uniqueVisitors = new Set(bounded.map((r) => r.visitorId)).size;

    return {
      since,
      until,
      user: args.user ?? null,
      pageviews: bounded.length,
      uniqueVisitors,
      truncated: rows.length >= MAX_SCAN,
    };
  },
});

/** events_count — custom event count, optionally filtered by event name and/or user. */
export const eventsCount = internalQuery({
  args: {
    writeKey: v.string(),
    name: v.optional(v.string()),
    since: v.optional(v.number()),
    until: v.optional(v.number()),
    user: v.optional(v.string()),
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

    const bounded = rows.filter(
      (r) => r.timestamp <= until && (!args.user || matchesUser(r, args.user)),
    );
    const filtered = args.name
      ? bounded.filter((r) => r.name === args.name)
      : bounded;

    const uniqueVisitors = new Set(filtered.map((r) => r.visitorId)).size;

    return {
      name: args.name ?? null,
      user: args.user ?? null,
      since,
      until,
      count: filtered.length,
      uniqueVisitors,
      truncated: rows.length >= MAX_SCAN,
    };
  },
});

/**
 * weekly_digest — composite snapshot so an agent gets "how did we do this
 * window?" in one call. Aggregates pageviews + events + top-5s, plus an
 * optional period-over-period delta against the prior equal-length period.
 *
 * Cheaper than chaining 4-5 tools because we do one scan per table per
 * period. The `truncated` flags tell the agent whether the scan cap kicked
 * in (in which case narrow `days` to get exact numbers).
 */
const DIGEST_SCAN_CAP = 50_000;

export const weeklyDigest = internalQuery({
  args: {
    writeKey: v.string(),
    days: v.optional(v.number()),
    compare: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const days = Math.min(Math.max(args.days ?? 7, 1), 90);
    const compare = args.compare ?? true;
    const DAY_MS = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const current = { since: now - days * DAY_MS, until: now };
    const previous = compare
      ? { since: now - 2 * days * DAY_MS, until: now - days * DAY_MS }
      : null;

    const currentStats = await windowStats(ctx, args.writeKey, current);
    const previousStats = previous
      ? await windowStats(ctx, args.writeKey, previous)
      : null;

    return {
      window: { days, since: current.since, until: current.until },
      current: currentStats,
      previous: previousStats,
      comparison: previousStats
        ? {
            uniqueVisitorsDelta: pctDelta(
              currentStats.traffic.uniqueVisitors,
              previousStats.traffic.uniqueVisitors,
            ),
            pageviewsDelta: pctDelta(
              currentStats.traffic.pageviews,
              previousStats.traffic.pageviews,
            ),
            sessionsDelta: pctDelta(
              currentStats.traffic.sessions,
              previousStats.traffic.sessions,
            ),
            // Bounce-rate delta is in percentage points, not percent change.
            bounceRatePointsDelta:
              currentStats.traffic.bounceRate -
              previousStats.traffic.bounceRate,
            avgSessionDurationDelta: pctDelta(
              currentStats.traffic.avgSessionDurationSeconds,
              previousStats.traffic.avgSessionDurationSeconds,
            ),
            customEventsDelta: pctDelta(
              currentStats.customEventsTotal,
              previousStats.customEventsTotal,
            ),
          }
        : null,
    };
  },
});

function pctDelta(curr: number, prev: number): number | null {
  if (prev === 0) return curr > 0 ? null : 0;
  return Math.round(((curr - prev) / prev) * 1000) / 10;
}

type WindowRange = { since: number; until: number };

async function windowStats(
  ctx: QueryCtx,
  writeKey: string,
  range: WindowRange,
) {
  const pageviewRows = await ctx.db
    .query("pageviews")
    .withIndex("by_writeKey_and_timestamp", (q) =>
      q.eq("writeKey", writeKey).gte("timestamp", range.since),
    )
    .order("desc")
    .take(DIGEST_SCAN_CAP);

  const eventRows = await ctx.db
    .query("events")
    .withIndex("by_writeKey_and_timestamp", (q) =>
      q.eq("writeKey", writeKey).gte("timestamp", range.since),
    )
    .order("desc")
    .take(DIGEST_SCAN_CAP);

  const pageviews = pageviewRows.filter((r) => r.timestamp <= range.until);
  const events = eventRows.filter((r) => r.timestamp <= range.until);

  const visitors = new Set(pageviews.map((r) => r.visitorId));
  const sessionStats = new Map<
    string,
    { count: number; minTs: number; maxTs: number }
  >();
  const pageMap = new Map<string, { views: number; visitors: Set<string> }>();
  const refMap = new Map<string, number>();

  for (const r of pageviews) {
    const s = sessionStats.get(r.sessionId) ?? {
      count: 0,
      minTs: r.timestamp,
      maxTs: r.timestamp,
    };
    s.count++;
    s.minTs = Math.min(s.minTs, r.timestamp);
    s.maxTs = Math.max(s.maxTs, r.timestamp);
    sessionStats.set(r.sessionId, s);

    const p = pageMap.get(r.path) ?? {
      views: 0,
      visitors: new Set<string>(),
    };
    p.views++;
    p.visitors.add(r.visitorId);
    pageMap.set(r.path, p);

    const host = r.referrerHost || "(direct)";
    refMap.set(host, (refMap.get(host) ?? 0) + 1);
  }

  const sessions = sessionStats.size;
  const bounced = [...sessionStats.values()].filter(
    (s) => s.count === 1,
  ).length;
  const bounceRate = sessions > 0 ? Math.round((bounced / sessions) * 100) : 0;

  // Session duration uses only sessions with at least 2 pageviews so
  // single-hit sessions don't drag the average to zero.
  const durations = [...sessionStats.values()]
    .filter((s) => s.count > 1)
    .map((s) => (s.maxTs - s.minTs) / 1000);
  const avgSessionDurationSeconds =
    durations.length > 0
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : 0;

  const topPages = [...pageMap.entries()]
    .sort((a, b) => b[1].views - a[1].views)
    .slice(0, 5)
    .map(([path, { views, visitors: vs }]) => ({
      path,
      views,
      uniqueVisitors: vs.size,
    }));

  const topReferrers = [...refMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([source, visits]) => ({ source, visits }));

  const eventNameCounts = new Map<string, number>();
  for (const e of events) {
    eventNameCounts.set(e.name, (eventNameCounts.get(e.name) ?? 0) + 1);
  }
  const topEvents = [...eventNameCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  return {
    traffic: {
      uniqueVisitors: visitors.size,
      pageviews: pageviews.length,
      sessions,
      bounceRate,
      avgSessionDurationSeconds,
    },
    topPages,
    topReferrers,
    customEventsTotal: events.length,
    topEvents,
    truncated: {
      pageviews: pageviewRows.length >= DIGEST_SCAN_CAP,
      events: eventRows.length >= DIGEST_SCAN_CAP,
    },
  };
}

/** recent_events — last N events, optionally filtered by name/user, with optional prop redaction for PII. */
export const recentEvents = internalQuery({
  args: {
    writeKey: v.string(),
    name: v.optional(v.string()),
    limit: v.optional(v.number()),
    redact: v.optional(v.boolean()),
    user: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const cap = clampLimit(args.limit, 20, 100);
    const redact = args.redact ?? true;

    // Filtering by name/user is post-scan — index doesn't cover them. For
    // MVP this is fine; add indexes if access pattern warrants.
    const scanSize = args.name || args.user ? MAX_SCAN : cap;
    const rows = await ctx.db
      .query("events")
      .withIndex("by_writeKey_and_timestamp", (q) =>
        q.eq("writeKey", args.writeKey),
      )
      .order("desc")
      .take(scanSize);

    const filtered = rows
      .filter(
        (r) =>
          (!args.name || r.name === args.name) &&
          (!args.user || matchesUser(r, args.user)),
      )
      .slice(0, cap);

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

/**
 * user_activity — composite "how is this user using my app?" snapshot.
 *
 * Matches `user` against either the stored visitorId (exact; this is what
 * the ingest handler stores the track()-time `userId` argument as) or the
 * userEmail (case-insensitive). Returns an identity block, aggregate
 * counts, top pages this user visited, this user's recent events, and the
 * event names they fire most.
 *
 * Post-scan filter on MAX_SCAN events + pageviews; if agents see
 * `truncated: true`, narrow the `since`/`until` window. Swap to a proper
 * index once we see a real project regularly hit the cap.
 */
export const userActivity = internalQuery({
  args: {
    writeKey: v.string(),
    user: v.string(),
    since: v.optional(v.number()),
    until: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { since, until } = resolveRange(args);

    const pageviewRows = await ctx.db
      .query("pageviews")
      .withIndex("by_writeKey_and_timestamp", (q) =>
        q.eq("writeKey", args.writeKey).gte("timestamp", since),
      )
      .order("desc")
      .take(MAX_SCAN);

    const eventRows = await ctx.db
      .query("events")
      .withIndex("by_writeKey_and_timestamp", (q) =>
        q.eq("writeKey", args.writeKey).gte("timestamp", since),
      )
      .order("desc")
      .take(MAX_SCAN);

    const matchedPv = pageviewRows.filter(
      (r) => r.timestamp <= until && matchesUser(r, args.user),
    );
    const matchedEv = eventRows.filter(
      (r) => r.timestamp <= until && matchesUser(r, args.user),
    );

    if (matchedPv.length === 0 && matchedEv.length === 0) {
      return {
        user: null,
        window: { since, until },
        totalPageviews: 0,
        totalEvents: 0,
        sessionsCount: 0,
        topPages: [],
        topEventNames: [],
        recentEvents: [],
        truncated: {
          pageviews: pageviewRows.length >= MAX_SCAN,
          events: eventRows.length >= MAX_SCAN,
        },
      };
    }

    // Build the identity block from whichever rows have the richest data.
    // newest row wins for display fields; oldest/newest timestamps give
    // firstSeen/lastSeen across both tables.
    const combined = [
      ...matchedPv.map((r) => ({
        visitorId: r.visitorId,
        userEmail: r.userEmail,
        userName: r.userName,
        timestamp: r.timestamp,
      })),
      ...matchedEv.map((r) => ({
        visitorId: r.visitorId,
        userEmail: r.userEmail,
        userName: r.userName,
        timestamp: r.timestamp,
      })),
    ].sort((a, b) => b.timestamp - a.timestamp);

    const latest = combined[0];
    const firstSeen = combined[combined.length - 1].timestamp;
    const lastSeen = combined[0].timestamp;
    const sessionsCount = new Set(matchedPv.map((r) => r.sessionId)).size;

    const pageCounts = new Map<string, number>();
    for (const r of matchedPv) {
      pageCounts.set(r.path, (pageCounts.get(r.path) ?? 0) + 1);
    }
    const topPages = [...pageCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([path, views]) => ({ path, views }));

    const eventNameCounts = new Map<string, number>();
    for (const r of matchedEv) {
      eventNameCounts.set(r.name, (eventNameCounts.get(r.name) ?? 0) + 1);
    }
    const topEventNames = [...eventNameCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }));

    const recentEvents = matchedEv.slice(0, 20).map((r) => ({
      name: r.name,
      timestamp: r.timestamp,
      environment: r.environment ?? null,
      props: r.props,
    }));

    return {
      user: {
        matchedBy: args.user,
        visitorId: latest.visitorId,
        userEmail: latest.userEmail ?? null,
        userName: latest.userName ?? null,
        firstSeen,
        lastSeen,
      },
      window: { since, until },
      totalPageviews: matchedPv.length,
      totalEvents: matchedEv.length,
      sessionsCount,
      topPages,
      topEventNames,
      recentEvents,
      truncated: {
        pageviews: pageviewRows.length >= MAX_SCAN,
        events: eventRows.length >= MAX_SCAN,
      },
    };
  },
});
