import type { FunctionReference } from "convex/server";

// The production Convalytics ingest endpoint.
// Override via options.ingestUrl for local development or self-hosting.
const DEFAULT_INGEST_URL = "https://peaceful-bobcat-731.convex.site/ingest";

type TrackArgs = {
  name: string;
  userId: string;
  sessionId?: string;
  timestamp?: number;
  props?: Record<string, string | number | boolean>;
};

// Minimal shape of the component API reference (typeof components.convalytics).
// TypeScript resolves this from the parent app's generated _generated/api.ts.
type ConvalyticsComponent = {
  lib: {
    configure: FunctionReference<
      "mutation",
      "public",
      { writeKey: string; ingestUrl: string },
      null
    >;
    track: FunctionReference<"mutation", "public", TrackArgs, null>;
  };
};

// Minimal context interface — satisfied by both MutationCtx and ActionCtx.
interface RunMutationCtx {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  runMutation(ref: FunctionReference<"mutation", any, any, any>, args?: any): Promise<any>;
}

export type { ConvalyticsComponent };

/**
 * Server-side Convalytics analytics for Convex.
 *
 * @example
 * ```typescript
 * // convex/analytics.ts
 * import { components } from "./_generated/api";
 * import { Convalytics } from "@convalytics/convex";
 *
 * export const analytics = new Convalytics(components.convalytics, {
 *   writeKey: process.env.CONVALYTICS_WRITE_KEY!,
 * });
 * ```
 */
export class Convalytics {
  private component: ConvalyticsComponent;
  private options: { writeKey: string; ingestUrl: string };

  constructor(
    component: ConvalyticsComponent,
    options: { writeKey: string; ingestUrl?: string },
  ) {
    this.component = component;
    this.options = {
      writeKey: options.writeKey,
      ingestUrl: options.ingestUrl ?? DEFAULT_INGEST_URL,
    };
  }

  /**
   * Store config in the component's database.
   * Call once during app setup — safe to call on every deploy.
   *
   * @example
   * ```typescript
   * export const setup = internalMutation({
   *   handler: async (ctx) => {
   *     await analytics.configure(ctx);
   *   },
   * });
   * ```
   */
  async configure(ctx: RunMutationCtx): Promise<void> {
    await ctx.runMutation(this.component.lib.configure, {
      writeKey: this.options.writeKey,
      ingestUrl: this.options.ingestUrl,
    });
  }

  /**
   * Track a server-side event from any Convex mutation or action.
   * The event is sent asynchronously — it never blocks or throws in the caller.
   *
   * @example
   * ```typescript
   * export const createUser = mutation({
   *   handler: async (ctx, args) => {
   *     const userId = await ctx.db.insert("users", args);
   *     await analytics.track(ctx, { name: "user_signed_up", userId: String(userId) });
   *     return userId;
   *   },
   * });
   * ```
   */
  async track(ctx: RunMutationCtx, event: TrackArgs): Promise<void> {
    await ctx.runMutation(this.component.lib.track, event);
  }
}
