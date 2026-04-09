import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { MutationCtx, QueryCtx } from "./_generated/server";
import { PLANS, type PlanId } from "./plans";
import { validateSession, getUserTeamIds } from "./authHelpers";

function monthKey(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthWindowStart(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
}

// Returns the team that owns a write key, or null.
export async function getTeamForWriteKey(
  ctx: QueryCtx | MutationCtx,
  writeKey: string,
) {
  const project = await ctx.db
    .query("projects")
    .withIndex("by_writeKey", (q) => q.eq("writeKey", writeKey))
    .unique();
  if (!project?.teamId) return null;
  return ctx.db.get("teams", project.teamId);
}

// Check quota and increment by `count`. Returns whether events are allowed.
// Handles month rollover automatically.
// Also returns the updated usage for threshold checking.
export const checkAndIncrement = internalMutation({
  args: {
    writeKey: v.string(),
    count: v.number(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    allowed: boolean;
    teamId: Id<"teams"> | null;
    usageAfter: number;
    limit: number;
    plan: PlanId;
  }> => {
    const team = await getTeamForWriteKey(ctx, args.writeKey);
    if (!team) {
      // Unclaimed project — apply free tier limits using write key as key
      const limit = PLANS.free.eventsPerMonth;
      const key = `monthlyQuota:${args.writeKey}`;
      const window = monthWindowStart();
      const existing = await ctx.db
        .query("rateLimits")
        .withIndex("by_key_and_window", (q) =>
          q.eq("key", key).eq("window", window),
        )
        .unique();
      if (existing) {
        if (existing.count >= limit || existing.count + args.count > limit) {
          return {
            allowed: false,
            teamId: null,
            usageAfter: existing.count,
            limit,
            plan: "free",
          };
        }
        const usageAfter = existing.count + args.count;
        await ctx.db.patch("rateLimits", existing._id, { count: usageAfter });
        return {
          allowed: true,
          teamId: null,
          usageAfter,
          limit,
          plan: "free",
        };
      }
      if (args.count > limit) {
        return {
          allowed: false,
          teamId: null,
          usageAfter: 0,
          limit,
          plan: "free",
        };
      }
      await ctx.db.insert("rateLimits", {
        key,
        window,
        count: args.count,
      });
      return {
        allowed: true,
        teamId: null,
        usageAfter: args.count,
        limit,
        plan: "free",
      };
    }

    const plan = (team.plan ?? "free") as PlanId;
    // Use the stored limit as source of truth — billing.applySubscription keeps it in sync.
    const limit =
      team.usageLimitEventsPerMonth ??
      PLANS[plan]?.eventsPerMonth ??
      PLANS.free.eventsPerMonth;
    const currentMonth = monthKey();

    // Reset counter on new month
    const storedMonth = team.usageMonthKey ?? "";
    const currentUsage =
      storedMonth === currentMonth ? (team.usageEventsThisMonth ?? 0) : 0;

    if (currentUsage >= limit || currentUsage + args.count > limit) {
      return {
        allowed: false,
        teamId: team._id,
        usageAfter: currentUsage,
        limit,
        plan,
      };
    }

    const usageAfter = currentUsage + args.count;
    await ctx.db.patch("teams", team._id, {
      usageEventsThisMonth: usageAfter,
      usageMonthKey: currentMonth,
      // Reset notification flags on month rollover
      ...(storedMonth !== currentMonth
        ? { notifiedAt80Pct: false, notifiedAt100Pct: false }
        : {}),
    });

    return { allowed: true, teamId: team._id, usageAfter, limit, plan };
  },
});

// Anti-abuse: check and increment unclaimed project provisioning per IP.
// Returns true if allowed.
export const checkProvisionAbuse = internalMutation({
  args: { ip: v.string(), limit: v.number() },
  handler: async (ctx, args): Promise<boolean> => {
    const now = Date.now();
    const window = Math.floor(now / 3_600_000) * 3_600_000; // 1-hour windows

    const existing = await ctx.db
      .query("provisionAbuse")
      .withIndex("by_ip_and_window", (q) =>
        q.eq("ip", args.ip).eq("window", window),
      )
      .unique();

    if (existing) {
      if (existing.count >= args.limit) return false;
      await ctx.db.patch("provisionAbuse", existing._id, {
        count: existing.count + 1,
      });
      return true;
    }

    await ctx.db.insert("provisionAbuse", { ip: args.ip, window, count: 1 });
    return true;
  },
});

// Cleanup old provisionAbuse records (called from cron).
export const cleanupProvisionAbuse = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - 2 * 3_600_000; // keep 2 hours
    const docs = await ctx.db.query("provisionAbuse").take(500);
    for (const doc of docs) {
      if (doc.window < cutoff) {
        await ctx.db.delete("provisionAbuse", doc._id);
      }
    }
  },
});

// Public query — returns billing/usage info for the current user's team.
// Used by the in-app billing page.
export const getMyUsage = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const session = await validateSession(ctx, args.sessionToken);
    if (!session) return null;

    const teamIds = await getUserTeamIds(ctx, session.userId);
    if (teamIds.length === 0) return null;

    const team = await ctx.db.get("teams", teamIds[0]);
    if (!team) return null;

    const plan = (team.plan ?? "free") as PlanId;
    const limit =
      team.usageLimitEventsPerMonth ??
      PLANS[plan]?.eventsPerMonth ??
      PLANS.free.eventsPerMonth;
    const currentMonth = monthKey();
    const usage =
      team.usageMonthKey === currentMonth
        ? (team.usageEventsThisMonth ?? 0)
        : 0;

    return {
      plan,
      usage,
      limit,
      retentionDays: PLANS[plan]?.retentionDays ?? PLANS.free.retentionDays,
      hasStripeSubscription: !!team.stripeSubscriptionId,
    };
  },
});