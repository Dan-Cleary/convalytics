import { mutation, internalAction } from "./_generated/server.js";
import { internal } from "./_generated/api.js";
import { v } from "convex/values";

const PROPS_VALIDATOR = v.record(
  v.string(),
  v.union(v.string(), v.number(), v.boolean()),
);

/**
 * Store the write key and ingest URL in the component's config table.
 * Call this once during app setup (e.g. in a setup mutation or init action).
 * Safe to call multiple times — upserts on repeat.
 */
export const configure = mutation({
  args: {
    writeKey: v.string(),
    ingestUrl: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("config").first();
    if (existing) {
      await ctx.db.patch(existing._id, args);
    } else {
      await ctx.db.insert("config", args);
    }
    return null;
  },
});

/**
 * Track a server-side event. Reads config from the database, then schedules
 * an action to POST the event to the Convalytics ingest endpoint.
 *
 * Mutations cannot call fetch() directly — scheduling an action is the
 * idiomatic Convex pattern for fire-and-forget HTTP calls.
 */
export const track = mutation({
  args: {
    name: v.string(),
    userId: v.string(),
    sessionId: v.optional(v.string()),
    timestamp: v.optional(v.number()),
    props: v.optional(PROPS_VALIDATOR),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const config = await ctx.db.query("config").first();
    if (!config) {
      throw new Error(
        "[Convalytics] Not configured. Call analytics.configure(ctx) first.",
      );
    }
    await ctx.scheduler.runAfter(0, internal.lib.sendEvent, {
      writeKey: config.writeKey,
      ingestUrl: config.ingestUrl,
      name: args.name,
      userId: args.userId,
      sessionId: args.sessionId ?? crypto.randomUUID(),
      timestamp: args.timestamp ?? Date.now(),
      props: args.props ?? {},
    });
    return null;
  },
});

/**
 * Internal action that POSTs a single event to the Convalytics ingest endpoint.
 * Fire-and-forget: logs errors but never throws, so analytics never breaks the app.
 */
export const sendEvent = internalAction({
  args: {
    writeKey: v.string(),
    ingestUrl: v.string(),
    name: v.string(),
    userId: v.string(),
    sessionId: v.string(),
    timestamp: v.number(),
    props: PROPS_VALIDATOR,
  },
  returns: v.null(),
  handler: async (_ctx, args) => {
    try {
      const resp = await fetch(args.ingestUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          writeKey: args.writeKey,
          name: args.name,
          userId: args.userId,
          sessionId: args.sessionId,
          timestamp: args.timestamp,
          props: args.props,
        }),
      });
      if (!resp.ok) {
        console.error(`[Convalytics] Ingest returned ${resp.status}: ${await resp.text()}`);
      }
    } catch (e) {
      console.error("[Convalytics] Failed to send event:", e);
    }
    return null;
  },
});
