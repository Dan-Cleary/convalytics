/**
 * Shared analytics scan helpers used by both the dashboard (convex/funnels.ts)
 * and the MCP server (convex/mcp.ts).
 *
 * Keeping these in one place is how we guarantee that numbers an agent
 * reports over MCP match what a user sees in the dashboard. When you tweak
 * the window semantics here, both surfaces change together.
 *
 * Underscore-prefixed filename excludes this module from Convex's function
 * registry — it's a pure helper module, not a query/mutation surface.
 */

import type { QueryCtx } from "./_generated/server";

export const DEFAULT_SINCE_MS = 7 * 24 * 60 * 60 * 1000;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;
export const MAX_SCAN = 10_000;

export function clampLimit(
  limit: number | undefined,
  def = DEFAULT_LIMIT,
  max = MAX_LIMIT,
): number {
  if (!limit || limit <= 0) return def;
  return Math.min(limit, max);
}

export function resolveRange(args: {
  since?: number;
  until?: number;
}): { since: number; until: number } {
  const until = args.until ?? Date.now();
  const since = args.since ?? until - DEFAULT_SINCE_MS;
  return { since, until };
}

/**
 * Scan pageviews in a window, using the environment-scoped index when the
 * caller narrowed to one env (faster + cheaper than scanning all rows then
 * filtering in-memory).
 */
export function scanPageviews(
  ctx: QueryCtx,
  writeKey: string,
  since: number,
  environment: string | undefined,
  limit: number,
) {
  if (environment) {
    return ctx.db
      .query("pageviews")
      .withIndex("by_writeKey_and_environment_and_timestamp", (q) =>
        q
          .eq("writeKey", writeKey)
          .eq("environment", environment)
          .gte("timestamp", since),
      )
      .order("desc")
      .take(limit);
  }
  return ctx.db
    .query("pageviews")
    .withIndex("by_writeKey_and_timestamp", (q) =>
      q.eq("writeKey", writeKey).gte("timestamp", since),
    )
    .order("desc")
    .take(limit);
}

/** Same shape for events — keeps both tables' env-scoped indexes honored. */
export function scanEvents(
  ctx: QueryCtx,
  writeKey: string,
  since: number,
  environment: string | undefined,
  limit: number,
) {
  if (environment) {
    return ctx.db
      .query("events")
      .withIndex("by_writeKey_and_environment_and_timestamp", (q) =>
        q
          .eq("writeKey", writeKey)
          .eq("environment", environment)
          .gte("timestamp", since),
      )
      .order("desc")
      .take(limit);
  }
  return ctx.db
    .query("events")
    .withIndex("by_writeKey_and_timestamp", (q) =>
      q.eq("writeKey", writeKey).gte("timestamp", since),
    )
    .order("desc")
    .take(limit);
}

/**
 * Match a stored row against the `user` argument an agent passed. Emails are
 * case-insensitive (users don't think in case); visitorId is exact because
 * it's an opaque identifier.
 */
export function matchesUser(
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
