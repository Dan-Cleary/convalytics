import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { PLANS, type PlanId } from "./plans";

const BATCH_SIZE = 200;
const NIGHTLY_RETENTION_BATCH_SIZE = 500;

// Prune events older than the team's retention window.
// Processes one team at a time and self-reschedules if there's more to delete.
export const pruneEvents = internalMutation({
  args: {
    writeKey: v.string(),
    retentionDays: v.number(),
    table: v.union(v.literal("events"), v.literal("pageviews")),
  },
  handler: async (ctx, args) => {
    const cutoff = Date.now() - args.retentionDays * 24 * 60 * 60 * 1000;

    let rowCount: number;
    if (args.table === "events") {
      const rows = await ctx.db
        .query("events")
        .withIndex("by_writeKey_and_timestamp", (q) =>
          q.eq("writeKey", args.writeKey).lt("timestamp", cutoff),
        )
        .take(BATCH_SIZE);
      for (const row of rows) {
        await ctx.db.delete("events", row._id);
      }
      rowCount = rows.length;
    } else {
      const rows = await ctx.db
        .query("pageviews")
        .withIndex("by_writeKey_and_timestamp", (q) =>
          q.eq("writeKey", args.writeKey).lt("timestamp", cutoff),
        )
        .take(BATCH_SIZE);
      for (const row of rows) {
        await ctx.db.delete("pageviews", row._id);
      }
      rowCount = rows.length;
    }

    // If we hit the batch limit there may be more — reschedule immediately
    if (rowCount === BATCH_SIZE) {
      await ctx.scheduler.runAfter(0, internal.retention.pruneEvents, {
        writeKey: args.writeKey,
        retentionDays: args.retentionDays,
        table: args.table,
      });
    }
  },
});

// Nightly job: fan out pruneEvents for every project, using the team's plan retention.
export const runNightlyRetention = internalMutation({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, args) => {
    // Scan projects in pages and enqueue retention for claimed projects.
    const projects = await ctx.db.query("projects").paginate({
      numItems: NIGHTLY_RETENTION_BATCH_SIZE,
      cursor: args.cursor ?? null,
    });

    for (const project of projects.page) {
      if (!project.teamId || !project.claimed) continue;

      const team = await ctx.db.get("teams", project.teamId);
      if (!team) continue;

      const plan = (team.plan ?? "free") as PlanId;
      const retentionDays =
        PLANS[plan]?.retentionDays ?? PLANS.free.retentionDays;

      await ctx.scheduler.runAfter(0, internal.retention.pruneEvents, {
        writeKey: project.writeKey,
        retentionDays,
        table: "events",
      });
      await ctx.scheduler.runAfter(0, internal.retention.pruneEvents, {
        writeKey: project.writeKey,
        retentionDays,
        table: "pageviews",
      });
    }

    if (!projects.isDone) {
      await ctx.scheduler.runAfter(0, internal.retention.runNightlyRetention, {
        cursor: projects.continueCursor,
      });
    }
  },
});
