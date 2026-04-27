/**
 * Public live stats — the unauthenticated `/live` page reads from here.
 *
 * Reads a bounded window of recent event + pageview rows, buckets by UTC day,
 * and returns a cumulative running total for the sampled data.
 *
 * Convex queries are reactive: each ingest invalidates this query and
 * pushes a fresh result down the websocket, so the live counter ticks up
 * on the page in real time without polling.
 *
 * We intentionally cap the number of scanned rows per table so this query
 * never hits Convex's per-function read limit.
 */

import { query } from "./_generated/server";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_ROWS_PER_TABLE = 8_000;

export const stats = query({
  args: {},
  handler: async (ctx) => {
    const events = await ctx.db
      .query("events")
      .order("desc")
      .take(MAX_ROWS_PER_TABLE);
    const pageviews = await ctx.db
      .query("pageviews")
      .order("desc")
      .take(MAX_ROWS_PER_TABLE);

    const dayBuckets = new Map<number, number>();
    for (const e of events) {
      const day = Math.floor(e.timestamp / DAY_MS) * DAY_MS;
      dayBuckets.set(day, (dayBuckets.get(day) ?? 0) + 1);
    }
    for (const p of pageviews) {
      const day = Math.floor(p.timestamp / DAY_MS) * DAY_MS;
      dayBuckets.set(day, (dayBuckets.get(day) ?? 0) + 1);
    }

    const sortedDays = [...dayBuckets.entries()].sort((a, b) => a[0] - b[0]);
    // Fill missing days with count=0 so a long quiet stretch shows as a
    // flat plateau on the chart instead of a misleading diagonal between
    // the two days that did have data.
    const daily: { day: number; count: number; cumulative: number }[] = [];
    let running = 0;
    if (sortedDays.length > 0) {
      const firstDay = sortedDays[0][0];
      const lastDay = sortedDays[sortedDays.length - 1][0];
      let cursor = 0;
      for (let day = firstDay; day <= lastDay; day += DAY_MS) {
        const next = sortedDays[cursor];
        let count = 0;
        if (next && next[0] === day) {
          count = next[1];
          cursor++;
        }
        running += count;
        daily.push({ day, count, cumulative: running });
      }
    }

    const truncated =
      events.length === MAX_ROWS_PER_TABLE ||
      pageviews.length === MAX_ROWS_PER_TABLE;

    return {
      total: events.length + pageviews.length,
      eventsTotal: events.length,
      pageviewsTotal: pageviews.length,
      daily,
      truncated,
    };
  },
});
