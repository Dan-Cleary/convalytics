import { mutation, internalAction } from "./_generated/server.js";
import { internal } from "./_generated/api.js";
import { v } from "convex/values";

const PROPS_VALIDATOR = v.record(
  v.string(),
  v.union(v.string(), v.number(), v.boolean()),
);

/**
 * Track a server-side event. writeKey and ingestUrl are passed directly from
 * the Convalytics class — no separate configure() call required.
 *
 * Scheduling an internalAction is the idiomatic Convex pattern for
 * fire-and-forget HTTP calls from mutations.
 */
export const track = mutation({
  args: {
    writeKey: v.string(),
    ingestUrl: v.string(),
    name: v.string(),
    userId: v.string(),
    sessionId: v.optional(v.string()),
    timestamp: v.optional(v.number()),
    props: v.optional(PROPS_VALIDATOR),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.scheduler.runAfter(0, internal.lib.sendEvent, {
      writeKey: args.writeKey,
      ingestUrl: args.ingestUrl,
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
