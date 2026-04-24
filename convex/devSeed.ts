/**
 * Dev-only seed helper for local testing on the feat/funnels worktree.
 *
 * Generates ~50 demo visitors over 14 days walking through a four-step funnel:
 *   "/" (home) → "/pricing" → signup_completed → payment_succeeded
 *
 * Shapes the data so you can click around and see non-trivial conversion
 * numbers in the UI. Matches (roughly) what codex/funnelsgpt seeds on
 * peaceful-bobcat-731, so side-by-side compares are apples-to-apples.
 *
 * Run:
 *   npx convex run devSeed:seedDemo
 *   npx convex run devSeed:seedDemo '{"visitors": 120}'
 */

import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { sha256Hex } from "./tokenHash";

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const DEFAULT_VISITORS = 80;
const MAX_VISITORS = 250;
const DEFAULT_DAYS = 6; // fits inside the default 7-day compute window
const DEMO_FUNNEL_NAME = "Demo activation funnel";

export const seedDemo = internalMutation({
  args: {
    visitors: v.optional(v.number()),
    days: v.optional(v.number()),
    writeKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const visitors = clamp(args.visitors ?? DEFAULT_VISITORS, 5, MAX_VISITORS);
    const days = clamp(args.days ?? DEFAULT_DAYS, 1, 90);

    const { projectId, writeKey, userId } = await resolveOrCreate(
      ctx,
      args.writeKey,
      now,
    );

    await ensureDemoFunnel(ctx, projectId, userId, now);

    let pvCount = 0;
    let evCount = 0;

    for (let i = 0; i < visitors; i++) {
      const visitorId = `demo-user-${String(i + 1).padStart(3, "0")}`;
      const sessionId = `demo-session-${String(i + 1).padStart(3, "0")}-${now}`;
      const tStart =
        now - days * DAY_MS + Math.floor((i / visitors) * days * DAY_MS);
      const environment = i % 9 === 0 ? "development" : "production";
      const userEmail = i % 4 === 0 ? `demo${i + 1}@example.com` : undefined;
      const userName = i % 4 === 0 ? `Demo User ${i + 1}` : undefined;

      // Step 1: everyone visits /
      await ctx.db.insert("pageviews", {
        writeKey,
        visitorId,
        sessionId,
        timestamp: tStart,
        environment,
        userEmail,
        userName,
        path: "/",
        referrer: i % 3 === 0 ? "https://news.ycombinator.com/" : "",
        referrerHost: i % 3 === 0 ? "news.ycombinator.com" : "",
        title: "Home",
        utm_source: i % 5 === 0 ? "newsletter" : undefined,
        utm_medium: i % 5 === 0 ? "email" : undefined,
        utm_campaign: i % 5 === 0 ? "spring_launch" : undefined,
        country: ["US", "GB", "DE", "JP", "BR"][i % 5],
        deviceType: ["desktop", "mobile", "tablet"][i % 3],
        browser: ["Chrome", "Safari", "Firefox", "Edge"][i % 4],
        osName: ["macOS", "Windows", "iOS", "Android"][i % 4],
      });
      pvCount++;

      // Step 2: ~82% hit /pricing ~8 minutes later.
      // Use (i * 31) mod 100 to spread selectivity across the visitor space
      // instead of clustering it at low i (which biased earlier windows).
      const pricingBit = (i * 31) % 100;
      const signupBit = (i * 47) % 100;
      const payBit = (i * 73) % 100;
      if (pricingBit < 82) {
        await ctx.db.insert("pageviews", {
          writeKey,
          visitorId,
          sessionId,
          timestamp: tStart + 8 * 60 * 1000,
          environment,
          userEmail,
          userName,
          path: "/pricing",
          referrer: "",
          referrerHost: "",
          title: "Pricing",
          country: ["US", "GB", "DE", "JP", "BR"][i % 5],
          deviceType: ["desktop", "mobile", "tablet"][i % 3],
          browser: ["Chrome", "Safari", "Firefox", "Edge"][i % 4],
          osName: ["macOS", "Windows", "iOS", "Android"][i % 4],
        });
        pvCount++;
      }

      // Step 3: ~45% fire signup_completed ~30 min later
      if (signupBit < 45) {
        await ctx.db.insert("events", {
          writeKey,
          name: "signup_completed",
          visitorId,
          sessionId,
          timestamp: tStart + 30 * 60 * 1000,
          environment,
          userEmail,
          userName,
          props: { plan: i % 3 === 0 ? "pro" : "free" },
        });
        evCount++;
      }

      // Step 4: ~22% fire payment_succeeded ~2 hours later
      if (payBit < 22) {
        await ctx.db.insert("events", {
          writeKey,
          name: "payment_succeeded",
          visitorId,
          sessionId,
          timestamp: tStart + 2 * HOUR_MS,
          environment,
          userEmail,
          userName,
          props: { amount: 29, currency: "USD" },
        });
        evCount++;
      }
    }

    const token = await ensureDemoApiToken(ctx, projectId, userId, now);

    return {
      writeKey,
      projectId,
      pageviewsInserted: pvCount,
      eventsInserted: evCount,
      visitors,
      days,
      apiToken: token,
    };
  },
});

async function ensureDemoApiToken(
  ctx: MutationCtx,
  projectId: Id<"projects">,
  userId: Id<"users">,
  now: number,
): Promise<string> {
  const project = await ctx.db.get(projectId);
  if (!project || !project.teamId) throw new Error("Project has no team");

  // Bump the team to solo plan so MCP isn't gated off.
  const team = await ctx.db.get(project.teamId);
  if (team && team.plan === "free") {
    await ctx.db.patch(project.teamId, { plan: "solo" });
  }

  // Deterministic demo token so repeat runs hand back the same string.
  const plain = "cnv_demo_feat_funnels_seed_token_0001";
  const tokenHash = await sha256Hex(plain);
  const existing = await ctx.db
    .query("apiTokens")
    .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
    .unique();
  if (existing) return plain;

  await ctx.db.insert("apiTokens", {
    tokenHash,
    teamId: project.teamId,
    createdBy: userId,
    name: "Demo seed token (feat/funnels)",
    scope: "read",
    createdAt: now,
  });
  return plain;
}

async function resolveOrCreate(
  ctx: MutationCtx,
  writeKey: string | undefined,
  now: number,
): Promise<{ projectId: Id<"projects">; writeKey: string; userId: Id<"users"> }> {
  // If explicit writeKey was passed, validate it.
  if (writeKey) {
    const p = await ctx.db
      .query("projects")
      .withIndex("by_writeKey", (q) => q.eq("writeKey", writeKey))
      .unique();
    if (!p) throw new Error(`No project found for writeKey ${writeKey}`);
    if (!p.teamId) throw new Error(`Project ${p._id} has no team`);
    const member = await ctx.db
      .query("teamMembers")
      .withIndex("by_teamId", (q) => q.eq("teamId", p.teamId!))
      .first();
    if (!member) throw new Error(`Team ${p.teamId} has no members`);
    return { projectId: p._id, writeKey, userId: member.userId };
  }

  // Otherwise, find an existing project or create everything from scratch.
  const firstProject = await ctx.db.query("projects").first();
  if (firstProject && firstProject.teamId) {
    const member = await ctx.db
      .query("teamMembers")
      .withIndex("by_teamId", (q) => q.eq("teamId", firstProject.teamId!))
      .first();
    if (member) {
      return {
        projectId: firstProject._id,
        writeKey: firstProject.writeKey,
        userId: member.userId,
      };
    }
  }

  // Fully fresh DB — fabricate a demo user + team + project.
  const userId = await ctx.db.insert("users", {
    name: "Demo Seed User",
    email: "seed@example.com",
    isAnonymous: false,
  });
  const teamId = await ctx.db.insert("teams", {
    name: "Demo Team",
    slug: "demo-team",
    plan: "solo",
    usageLimitEventsPerMonth: 100_000,
    createdAt: now,
  });
  await ctx.db.insert("teamMembers", {
    teamId,
    userId,
    role: "owner",
    joinedAt: now,
  });
  const newWriteKey = `cvk_demo_${Math.random().toString(36).slice(2, 14)}`;
  const projectId = await ctx.db.insert("projects", {
    teamId,
    name: "Demo project",
    writeKey: newWriteKey,
    claimed: true,
  });
  return { projectId, writeKey: newWriteKey, userId };
}

async function ensureDemoFunnel(
  ctx: MutationCtx,
  projectId: Id<"projects">,
  userId: Id<"users">,
  now: number,
) {
  const existing = await ctx.db
    .query("funnels")
    .withIndex("by_projectId", (q) => q.eq("projectId", projectId))
    .collect();
  if (existing.some((f) => f.name === DEMO_FUNNEL_NAME && f.status !== "deleted")) {
    return;
  }

  const project = await ctx.db.get(projectId);
  if (!project || !project.teamId) return;

  await ctx.db.insert("funnels", {
    teamId: project.teamId,
    projectId,
    name: DEMO_FUNNEL_NAME,
    description: "Seeded demo: home → pricing → signup → payment.",
    steps: [
      { kind: "pageview", match: "/", label: "Visited home" },
      { kind: "pageview", match: "/pricing", label: "Viewed pricing" },
      { kind: "event", match: "signup_completed", label: "Signed up" },
      { kind: "event", match: "payment_succeeded", label: "Paid" },
    ],
    conversionWindowMs: 7 * DAY_MS,
    createdBy: userId,
    createdAt: now,
    updatedAt: now,
  });
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, Math.floor(n)));
}
