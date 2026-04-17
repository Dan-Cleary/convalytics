import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { QUOTA_NOTIFY_THRESHOLDS } from "./plans";
import { render } from "@react-email/render";
import { QuotaEmail } from "./emails/QuotaEmail";
import { FROM, REPLY_TO, resend } from "./emailConfig";
const [QUOTA_NOTIFY_80_PCT, QUOTA_NOTIFY_100_PCT] = QUOTA_NOTIFY_THRESHOLDS;

// Called after every ingest when usage crosses 80% or 100%.
// Idempotent — checks notification flags before sending to avoid spam.
export const checkAndNotify = internalAction({
  args: {
    teamId: v.id("teams"),
    usageAfter: v.number(),
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    const pct = args.usageAfter / args.limit;
    const threshold =
      pct >= QUOTA_NOTIFY_100_PCT
        ? "100"
        : pct >= QUOTA_NOTIFY_80_PCT
          ? "80"
          : null;
    if (!threshold) return;

    const reservation = await ctx.runMutation(
      internal.notifications.reserveNotificationSend,
      { teamId: args.teamId, threshold },
    );
    if (!reservation.shouldSend || !reservation.ownerEmail) return;

    if (threshold === "100") {
      await resend.sendEmail(
        ctx,
        FROM,
        reservation.ownerEmail,
        "You've hit your Convalytics event limit",
        await render(
          QuotaEmail({
            pct: 100,
            usage: args.usageAfter,
            limit: args.limit,
            plan: reservation.plan,
          }),
        ),
        undefined,
        REPLY_TO,
      );
    } else {
      await resend.sendEmail(
        ctx,
        FROM,
        reservation.ownerEmail,
        "You've used 80% of your Convalytics event quota",
        await render(
          QuotaEmail({
            pct: 80,
            usage: args.usageAfter,
            limit: args.limit,
            plan: reservation.plan,
          }),
        ),
        undefined,
        REPLY_TO,
      );
    }
  },
});

export const reserveNotificationSend = internalMutation({
  args: {
    teamId: v.id("teams"),
    threshold: v.union(v.literal("80"), v.literal("100")),
  },
  handler: async (ctx, args) => {
    const team = await ctx.db.get("teams", args.teamId);
    if (!team)
      return {
        shouldSend: false,
        ownerEmail: null as string | null,
        plan: "free",
      };

    if (args.threshold === "100") {
      if (team.notifiedAt100Pct) {
        return {
          shouldSend: false,
          ownerEmail: null as string | null,
          plan: team.plan,
        };
      }
    } else if (team.notifiedAt80Pct || team.notifiedAt100Pct) {
      return {
        shouldSend: false,
        ownerEmail: null as string | null,
        plan: team.plan,
      };
    }

    const ownerMembership = await ctx.db
      .query("teamMembers")
      .withIndex("by_teamId", (q) => q.eq("teamId", args.teamId))
      .filter((q) => q.eq(q.field("role"), "owner"))
      .first();

    if (!ownerMembership) {
      return {
        shouldSend: false,
        ownerEmail: null as string | null,
        plan: team.plan,
      };
    }

    const user = await ctx.db.get(ownerMembership.userId);
    const ownerEmail = user?.email ?? null;
    if (!ownerEmail) {
      return {
        shouldSend: false,
        ownerEmail: null as string | null,
        plan: team.plan,
      };
    }

    if (args.threshold === "100") {
      await ctx.db.patch("teams", args.teamId, { notifiedAt100Pct: true });
    } else {
      await ctx.db.patch("teams", args.teamId, { notifiedAt80Pct: true });
    }

    return { shouldSend: true, ownerEmail, plan: team.plan };
  },
});

export const getTeamOwnerEmailQuery = internalQuery({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => {
    const team = await ctx.db.get("teams", args.teamId);
    if (!team) return { team: null, ownerEmail: null };

    const ownerMembership = await ctx.db
      .query("teamMembers")
      .withIndex("by_teamId", (q) => q.eq("teamId", args.teamId))
      .filter((q) => q.eq(q.field("role"), "owner"))
      .first();

    if (!ownerMembership) return { team, ownerEmail: null };

    const user = await ctx.db.get(ownerMembership.userId);
    return { team, ownerEmail: user?.email ?? null };
  },
});

export const markNotified = internalMutation({
  args: {
    teamId: v.id("teams"),
    threshold: v.union(v.literal("80"), v.literal("100")),
  },
  handler: async (ctx, args) => {
    if (args.threshold === "100") {
      await ctx.db.patch("teams", args.teamId, { notifiedAt100Pct: true });
    } else {
      await ctx.db.patch("teams", args.teamId, { notifiedAt80Pct: true });
    }
  },
});
