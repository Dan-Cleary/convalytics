import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";

// ---------------------------------------------------------------------------
// Session cleanup
// ---------------------------------------------------------------------------

/**
 * Delete expired sessions. Runs daily.
 * Sessions without expiresAt are considered legacy and are also deleted.
 */
export const cleanupExpiredSessions = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    let deleted = 0;

    // Query sessions and delete expired ones
    // Note: We iterate because Convex doesn't support delete-by-query
    const sessions = await ctx.db.query("sessions").collect();
    for (const session of sessions) {
      if (!session.expiresAt || session.expiresAt < now) {
        await ctx.db.delete("sessions", session._id);
        deleted++;
      }
    }

    if (deleted > 0) {
      console.log(`[Session cleanup] Deleted ${deleted} expired sessions`);
    }
  },
});

// ---------------------------------------------------------------------------
// Stats materialization (currently unused by queries)
// ---------------------------------------------------------------------------

/**
 * Materializes 7-day rolling stats per project.
 *
 * NOTE: Dashboard queries currently scan raw data directly and do not read
 * from dailyStats. This cron exists as a stepping stone for when raw scans
 * become too slow. At that point, queries should switch to reading dailyStats.
 *
 * TODO: Either switch queries to use this table, or remove this cron entirely.
 */
export const computeStats = internalMutation({
  args: {},
  handler: async (ctx) => {
    const today = new Date().toISOString().split("T")[0];
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    const projects = await ctx.db.query("projects").collect();

    for (const project of projects) {
      const events = await ctx.db
        .query("events")
        .withIndex("by_writeKey_and_timestamp", (q) =>
          q.eq("writeKey", project.writeKey).gte("timestamp", sevenDaysAgo),
        )
        .take(10000);

      const visitorSet = new Set(events.map((e) => e.visitorId));

      const existing = await ctx.db
        .query("dailyStats")
        .withIndex("by_writeKey_and_date", (q) =>
          q.eq("writeKey", project.writeKey).eq("date", today),
        )
        .unique();

      const pvs = await ctx.db
        .query("pageviews")
        .withIndex("by_writeKey_and_timestamp", (q) =>
          q.eq("writeKey", project.writeKey).gte("timestamp", sevenDaysAgo),
        )
        .take(10000);

      const pvSessions = new Set(pvs.map((pv) => pv.sessionId)).size;

      if (existing) {
        await ctx.db.patch("dailyStats", existing._id, {
          activeUsers: visitorSet.size,
          totalEvents: events.length,
          pageViews: pvs.length,
          sessions: pvSessions,
        });
      } else {
        await ctx.db.insert("dailyStats", {
          writeKey: project.writeKey,
          date: today,
          activeUsers: visitorSet.size,
          totalEvents: events.length,
          pageViews: pvs.length,
          sessions: pvSessions,
        });
      }
    }
  },
});

// ---------------------------------------------------------------------------
// Cron schedules
// ---------------------------------------------------------------------------

const crons = cronJobs();

// Clean up expired sessions daily at 3am UTC
crons.daily(
  "cleanup expired sessions",
  { hourUTC: 3, minuteUTC: 0 },
  internal.stats.cleanupExpiredSessions,
  {},
);

// Compute stats hourly (currently unused by queries)
crons.interval(
  "compute daily stats",
  { hours: 1 },
  internal.stats.computeStats,
  {},
);

export default crons;
