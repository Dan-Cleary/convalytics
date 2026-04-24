/**
 * Funnels — saved ordered-step conversion analyses.
 *
 * Public API for the dashboard. Each public query/mutation validates team
 * membership via validateProjectAccess or a direct team-membership check.
 * The MCP tool handlers in convex/mcp.ts mirror this surface as internal
 * queries/mutations; HTTP layer validates the token's team before dispatch.
 *
 * computeFunnel is exported as a plain async helper so both the dashboard's
 * `compute` query and the MCP tool share the same algorithm and numbers.
 */

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  MAX_SCAN,
  scanEvents,
  scanPageviews,
} from "./_analytics";
import {
  getTeamMembership,
  requireAuth,
  validateProjectAccess,
} from "./authHelpers";

export const DEFAULT_CONVERSION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const MIN_CONVERSION_WINDOW_MS = 60 * 1000; // 1 min
const MAX_CONVERSION_WINDOW_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

export const funnelStepValidator = v.object({
  kind: v.union(v.literal("event"), v.literal("pageview")),
  match: v.string(),
  label: v.optional(v.string()),
});

type FunnelStep = { kind: "event" | "pageview"; match: string; label?: string };

async function requireFunnelForTeam(
  ctx: QueryCtx | MutationCtx,
  funnelId: Id<"funnels">,
  userId: Id<"users">,
): Promise<Doc<"funnels">> {
  const funnel = await ctx.db.get(funnelId);
  if (!funnel) throw new Error("Funnel not found");
  const membership = await getTeamMembership(ctx, funnel.teamId, userId);
  if (!membership) throw new Error("Funnel not found");
  return funnel;
}

function isActive(f: Doc<"funnels">): boolean {
  return f.status !== "deleted";
}

function serialize(f: Doc<"funnels">) {
  return {
    id: f._id,
    projectId: f.projectId,
    name: f.name,
    description: f.description ?? null,
    steps: f.steps,
    conversionWindowMs: f.conversionWindowMs ?? DEFAULT_CONVERSION_WINDOW_MS,
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
  };
}

export const list = query({
  args: { writeKey: v.string() },
  handler: async (ctx, args) => {
    const project = await validateProjectAccess(ctx, args.writeKey);
    if (!project) return [];

    const rows = await ctx.db
      .query("funnels")
      .withIndex("by_projectId", (q) => q.eq("projectId", project._id))
      .collect();

    return rows
      .filter(isActive)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((f) => ({
        id: f._id,
        name: f.name,
        description: f.description ?? null,
        stepCount: f.steps.length,
        conversionWindowMs:
          f.conversionWindowMs ?? DEFAULT_CONVERSION_WINDOW_MS,
        createdAt: f.createdAt,
        updatedAt: f.updatedAt,
      }));
  },
});

export const get = query({
  args: { funnelId: v.id("funnels") },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const funnel = await requireFunnelForTeam(ctx, args.funnelId, userId);
    if (!isActive(funnel)) return null;
    return serialize(funnel);
  },
});

export const create = mutation({
  args: {
    writeKey: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    steps: v.array(funnelStepValidator),
    conversionWindowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const project = await validateProjectAccess(ctx, args.writeKey);
    if (!project || !project.teamId) {
      throw new Error("Project not found or access denied");
    }

    const cleanName = validateFunnelName(args.name);
    validateSteps(args.steps);
    validateConversionWindow(args.conversionWindowMs);

    const now = Date.now();
    return await ctx.db.insert("funnels", {
      projectId: project._id,
      teamId: project.teamId,
      name: cleanName,
      description: args.description?.trim() || undefined,
      steps: args.steps,
      conversionWindowMs: args.conversionWindowMs,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    funnelId: v.id("funnels"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    steps: v.optional(v.array(funnelStepValidator)),
    conversionWindowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const funnel = await requireFunnelForTeam(ctx, args.funnelId, userId);
    if (!isActive(funnel)) {
      throw new Error("Cannot update a deleted funnel");
    }

    const patch: Partial<Doc<"funnels">> = { updatedAt: Date.now() };
    if (args.name !== undefined) patch.name = validateFunnelName(args.name);
    if (args.description !== undefined)
      patch.description = args.description.trim() || undefined;
    if (args.steps !== undefined) {
      validateSteps(args.steps);
      patch.steps = args.steps;
    }
    if (args.conversionWindowMs !== undefined) {
      validateConversionWindow(args.conversionWindowMs);
      patch.conversionWindowMs = args.conversionWindowMs;
    }

    await ctx.db.patch(args.funnelId, patch);
  },
});

export const remove = mutation({
  args: { funnelId: v.id("funnels") },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const funnel = await requireFunnelForTeam(ctx, args.funnelId, userId);
    if (!isActive(funnel)) return;

    const now = Date.now();
    await ctx.db.patch(args.funnelId, {
      status: "deleted",
      deletedAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Dashboard editor autocomplete source. Returns distinct event names and
 * pageview paths seen on the project in the last 7 days, ordered by volume.
 * Narrow window because this is a reactive query: every ingest on the
 * project invalidates the subscription and reruns the scan while the editor
 * is open. 7d is plenty for "what have I been tracking lately?" — anything
 * older tends to be stale anyway.
 */
export const suggestStepMatches = query({
  args: { writeKey: v.string() },
  handler: async (ctx, args) => {
    const project = await validateProjectAccess(ctx, args.writeKey);
    if (!project) return { eventNames: [], pageviewPaths: [] };

    const since = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const events = await scanEvents(ctx, args.writeKey, since, undefined, MAX_SCAN);
    const pageviews = await scanPageviews(ctx, args.writeKey, since, undefined, MAX_SCAN);

    const evCounts = new Map<string, number>();
    for (const e of events) evCounts.set(e.name, (evCounts.get(e.name) ?? 0) + 1);
    const pvCounts = new Map<string, number>();
    for (const p of pageviews) pvCounts.set(p.path, (pvCounts.get(p.path) ?? 0) + 1);

    return {
      eventNames: [...evCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 50)
        .map(([name]) => name),
      pageviewPaths: [...pvCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 50)
        .map(([path]) => path),
    };
  },
});

export const compute = query({
  args: {
    funnelId: v.id("funnels"),
    since: v.optional(v.number()),
    until: v.optional(v.number()),
    environment: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const funnel = await requireFunnelForTeam(ctx, args.funnelId, userId);
    if (!isActive(funnel)) {
      throw new Error("Funnel has been deleted");
    }
    return computeFunnel(
      ctx,
      funnel,
      args.since,
      args.until,
      args.environment,
    );
  },
});

/**
 * Shared compute function. Dashboard and MCP both call into this so numbers
 * agree.
 *
 * Semantics:
 * - For each distinct visitor, walk steps in order. Step 1 matches the
 *   visitor's earliest qualifying row in [since, until].
 * - Step i>1 requires a match within [prev, prev + conversionWindowMs],
 *   also capped at until. Step-to-step window, not overall — matches how
 *   most product analytics tools expose it ("converted within 7 days of
 *   previous step").
 * - Scans cap at MAX_SCAN per table; `truncated` tells the caller if the
 *   cap was hit so they can narrow the window.
 */
export async function computeFunnel(
  ctx: QueryCtx,
  funnel: Doc<"funnels">,
  since: number | undefined,
  until: number | undefined,
  environment: string | undefined,
) {
  const project = await ctx.db.get(funnel.projectId);
  if (!project) {
    throw new Error("Project for this funnel no longer exists");
  }

  const resolvedUntil = until ?? Date.now();
  const resolvedSince =
    since ?? resolvedUntil - 7 * 24 * 60 * 60 * 1000;
  const cw = funnel.conversionWindowMs ?? DEFAULT_CONVERSION_WINDOW_MS;

  const needsPageviews = funnel.steps.some((s) => s.kind === "pageview");
  const needsEvents = funnel.steps.some((s) => s.kind === "event");

  const pvRows = needsPageviews
    ? await scanPageviews(
        ctx,
        project.writeKey,
        resolvedSince,
        environment,
        MAX_SCAN,
      )
    : [];
  const evRows = needsEvents
    ? await scanEvents(
        ctx,
        project.writeKey,
        resolvedSince,
        environment,
        MAX_SCAN,
      )
    : [];

  type Marker = {
    kind: "event" | "pageview";
    match: string;
    timestamp: number;
  };

  const byVisitor = new Map<string, Marker[]>();
  for (const p of pvRows) {
    if (p.timestamp > resolvedUntil) continue;
    const list = byVisitor.get(p.visitorId) ?? [];
    list.push({ kind: "pageview", match: p.path, timestamp: p.timestamp });
    byVisitor.set(p.visitorId, list);
  }
  for (const e of evRows) {
    if (e.timestamp > resolvedUntil) continue;
    const list = byVisitor.get(e.visitorId) ?? [];
    list.push({ kind: "event", match: e.name, timestamp: e.timestamp });
    byVisitor.set(e.visitorId, list);
  }
  // Scans return desc order; sort asc so `.find` returns the earliest match.
  for (const list of byVisitor.values()) {
    list.sort((a, b) => a.timestamp - b.timestamp);
  }

  const stepAgg = funnel.steps.map((s) => ({
    kind: s.kind,
    match: s.match,
    label: s.label ?? null,
    visitors: 0,
    totalTimeMs: 0,
    timeSamples: 0,
  }));

  for (const timeline of byVisitor.values()) {
    let prevT: number | null = null;
    for (let i = 0; i < funnel.steps.length; i++) {
      const step: FunnelStep = funnel.steps[i];
      // Step 0: match anywhere in the window, inclusive of `since`.
      // Step i>0: match strictly AFTER prevT, otherwise two consecutive
      // identical steps would be satisfied by one event (the prev-step hit
      // would match itself because `>= prevT` is true).
      const maxT: number =
        prevT !== null
          ? Math.min(prevT + cw, resolvedUntil)
          : resolvedUntil;
      const hit: Marker | undefined = timeline.find((m) => {
        if (m.kind !== step.kind || m.match !== step.match) return false;
        if (m.timestamp > maxT) return false;
        return prevT !== null ? m.timestamp > prevT : m.timestamp >= resolvedSince;
      });
      if (!hit) break;
      stepAgg[i].visitors++;
      if (prevT !== null) {
        stepAgg[i].totalTimeMs += hit.timestamp - prevT;
        stepAgg[i].timeSamples++;
      }
      prevT = hit.timestamp;
    }
  }

  const step1 = stepAgg[0]?.visitors ?? 0;
  const finalCount = stepAgg[stepAgg.length - 1]?.visitors ?? 0;

  return {
    funnelId: funnel._id,
    name: funnel.name,
    window: { since: resolvedSince, until: resolvedUntil },
    conversionWindowMs: cw,
    steps: stepAgg.map((s, i) => {
      const prev = i === 0 ? s.visitors : stepAgg[i - 1].visitors;
      return {
        index: i,
        kind: s.kind,
        match: s.match,
        label: s.label,
        visitors: s.visitors,
        conversionFromPrev: prev > 0 ? round4(s.visitors / prev) : 0,
        conversionFromStart: step1 > 0 ? round4(s.visitors / step1) : 0,
        avgTimeToConvertMs:
          s.timeSamples > 0
            ? Math.round(s.totalTimeMs / s.timeSamples)
            : null,
      };
    }),
    overallConversion: step1 > 0 ? round4(finalCount / step1) : 0,
    truncated: {
      events: needsEvents && evRows.length >= MAX_SCAN,
      pageviews: needsPageviews && pvRows.length >= MAX_SCAN,
    },
  };
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

export function validateSteps(steps: FunnelStep[]) {
  if (steps.length < 2) {
    throw new Error("A funnel needs at least 2 steps");
  }
  if (steps.length > 10) {
    throw new Error("A funnel can have at most 10 steps");
  }
  for (const [i, s] of steps.entries()) {
    if (!s.match || !s.match.trim()) {
      throw new Error(`Step ${i + 1}: match cannot be empty`);
    }
  }
}

export function validateConversionWindow(ms: number | undefined) {
  if (ms === undefined) return;
  if (
    !Number.isFinite(ms) ||
    ms < MIN_CONVERSION_WINDOW_MS ||
    ms > MAX_CONVERSION_WINDOW_MS
  ) {
    throw new Error(
      `conversionWindowMs must be between ${MIN_CONVERSION_WINDOW_MS} (1 min) and ${MAX_CONVERSION_WINDOW_MS} (90 days)`,
    );
  }
}

export function validateFunnelName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Funnel name cannot be empty");
  return trimmed;
}
