/**
 * Team invite flow.
 *
 * Owners/admins send email invites. Invitees sign in with Google (Convex
 * Auth) using the invited email address; `acceptInvite` matches the
 * authenticated email to `invitedEmail` and adds the user to the team.
 *
 * All identity lives in `authTables.users`. No passwords.
 */

import { v } from "convex/values";
import {
  internalAction,
  mutation,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { requireAuth, getTeamMembership } from "./authHelpers";
import { render } from "@react-email/render";
import { InviteEmail } from "./emails/InviteEmail";
import { FROM, REPLY_TO, resend } from "./emailConfig";
import type { QueryCtx, MutationCtx } from "./_generated/server";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

async function hashInviteToken(token: string): Promise<string> {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function findInviteByTokenHash(
  ctx: Pick<QueryCtx | MutationCtx, "db">,
  token: string,
) {
  const tokenHash = await hashInviteToken(token);
  return await ctx.db
    .query("teamInvites")
    .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
    .unique();
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** List all team members with user details. */
export const listMembers = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);

    const memberships = await ctx.db
      .query("teamMembers")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();

    if (memberships.length === 0) return null;
    // Use the first team (dashboard always works against one active team)
    const teamId = memberships[0].teamId;

    const allMemberships = await ctx.db
      .query("teamMembers")
      .withIndex("by_teamId", (q) => q.eq("teamId", teamId))
      .collect();

    const members = await Promise.all(
      allMemberships.map(async (m) => {
        const user = await ctx.db.get("users", m.userId);
        return {
          userId: m.userId,
          role: m.role,
          joinedAt: m.joinedAt,
          email: user?.email ?? null,
          name: user?.name ?? null,
        };
      }),
    );

    const myMembership = memberships.find((m) => m.teamId === teamId);
    return {
      teamId,
      members,
      myRole: myMembership?.role ?? "member",
      myUserId: userId,
    };
  },
});

/** List pending (not yet accepted, not expired) invites for the caller's team. */
export const listPendingInvites = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);

    const membership = await ctx.db
      .query("teamMembers")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();
    if (!membership) return null;

    const now = Date.now();
    const invites = await ctx.db
      .query("teamInvites")
      .withIndex("by_teamId", (q) => q.eq("teamId", membership.teamId))
      .collect();

    return invites
      .filter((i) => !i.acceptedAt && i.expiresAt > now)
      .map((i) => ({
        _id: i._id,
        invitedEmail: i.invitedEmail,
        role: i.role,
        expiresAt: i.expiresAt,
      }));
  },
});

/** Public — no auth required. Returns invite details for the accept page. */
export const getInviteByToken = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const invite = await findInviteByTokenHash(ctx, args.token);

    if (!invite) return { status: "not_found" as const };
    if (invite.acceptedAt) return { status: "already_accepted" as const };
    if (invite.expiresAt < Date.now()) return { status: "expired" as const };

    const team = await ctx.db.get("teams", invite.teamId);
    return {
      status: "valid" as const,
      invitedEmail: invite.invitedEmail,
      teamName: team?.name ?? "your team",
      role: invite.role,
    };
  },
});

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/** Send a team invite. Only owners and admins can invite. */
export const createInvite = mutation({
  args: {
    email: v.string(),
    role: v.union(v.literal("admin"), v.literal("member")),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);

    const membership = await ctx.db
      .query("teamMembers")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();
    if (!membership) return { error: "Not a team member" };
    if (membership.role === "member")
      return { error: "Only owners and admins can invite members" };

    const teamId = membership.teamId;
    const email = args.email.toLowerCase().trim();
    const now = Date.now();

    // Check if the invited email is already a team member (authTables.users
    // exposes email as an optional field).
    const existingUsers = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .collect();
    for (const existingUser of existingUsers) {
      const existingMembership = await getTeamMembership(
        ctx,
        teamId,
        existingUser._id,
      );
      if (existingMembership)
        return { error: "This person is already a team member" };
    }

    // Check for a pending (non-expired, non-accepted) invite to the same email
    const existing = await ctx.db
      .query("teamInvites")
      .withIndex("by_teamId_and_email", (q) =>
        q.eq("teamId", teamId).eq("invitedEmail", email),
      )
      .filter((q) =>
        q.and(
          q.eq(q.field("acceptedAt"), undefined),
          q.gt(q.field("expiresAt"), now),
        ),
      )
      .first();
    if (existing)
      return { error: "A pending invite already exists for this email" };

    const token =
      crypto.randomUUID().replace(/-/g, "") +
      crypto.randomUUID().replace(/-/g, "");
    const tokenHash = await hashInviteToken(token);

    await ctx.db.insert("teamInvites", {
      teamId,
      invitedEmail: email,
      tokenHash,
      role: args.role,
      invitedBy: userId,
      expiresAt: now + INVITE_TTL_MS,
    });

    const team = await ctx.db.get("teams", teamId);

    await ctx.scheduler.runAfter(0, internal.invites.sendInviteEmail, {
      toEmail: email,
      teamName: team?.name ?? "your team",
      token,
      role: args.role,
    });

    return { ok: true };
  },
});

/** Revoke a pending invite. Only owners and admins can revoke. */
export const revokeInvite = mutation({
  args: { inviteId: v.id("teamInvites") },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);

    const membership = await ctx.db
      .query("teamMembers")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();
    if (!membership) return { error: "Not a team member" };
    if (membership.role === "member")
      return { error: "Only owners and admins can revoke invites" };

    const invite = await ctx.db.get("teamInvites", args.inviteId);
    if (!invite) return { error: "Invite not found" };
    if (invite.teamId !== membership.teamId)
      return { error: "Invite belongs to a different team" };

    await ctx.db.delete("teamInvites", args.inviteId);
    return { ok: true };
  },
});

/** Remove a team member. Only owners can remove others; anyone can remove themselves. */
export const removeMember = mutation({
  args: { targetUserId: v.id("users") },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);

    const myMembership = await ctx.db
      .query("teamMembers")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();
    if (!myMembership) return { error: "Not a team member" };

    // Only owners can remove others (anyone can remove themselves)
    if (args.targetUserId !== userId && myMembership.role !== "owner") {
      return { error: "Only owners can remove other members" };
    }

    const targetMembership = await getTeamMembership(
      ctx,
      myMembership.teamId,
      args.targetUserId,
    );
    if (!targetMembership) return { error: "Member not found" };

    // Can't remove the last owner
    if (targetMembership.role === "owner") {
      const owners = await ctx.db
        .query("teamMembers")
        .withIndex("by_teamId", (q) => q.eq("teamId", myMembership.teamId))
        .filter((q) => q.eq(q.field("role"), "owner"))
        .collect();
      if (owners.length <= 1) return { error: "Cannot remove the last owner" };
    }

    await ctx.db.delete("teamMembers", targetMembership._id);
    return { ok: true };
  },
});

/**
 * Accept an invite using the caller's current authenticated Google identity.
 *
 * Caller must already be signed in (Convex Auth / Google). The invite's
 * `invitedEmail` must match the authenticated user's email.
 */
export const acceptInvite = mutation({
  args: { token: v.string() },
  returns: v.union(
    v.object({ ok: v.literal(true), teamId: v.id("teams") }),
    v.object({ error: v.string() }),
  ),
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);

    const user = await ctx.db.get("users", userId);
    if (!user) return { error: "User not found" };
    if (!user.email) {
      return {
        error:
          "Your Google account did not share an email; cannot match invite",
      };
    }

    const invite = await findInviteByTokenHash(ctx, args.token);
    if (!invite) return { error: "Invite not found" };
    if (invite.acceptedAt) return { error: "Invite already accepted" };
    if (invite.expiresAt < Date.now()) return { error: "Invite has expired" };

    if (user.email.toLowerCase().trim() !== invite.invitedEmail) {
      return {
        error: `This invite was sent to ${invite.invitedEmail}. Sign in with that Google account to accept.`,
      };
    }

    const existingMembership = await getTeamMembership(
      ctx,
      invite.teamId,
      userId,
    );
    if (!existingMembership) {
      await ctx.db.insert("teamMembers", {
        teamId: invite.teamId,
        userId,
        role: invite.role,
        joinedAt: Date.now(),
      });
    }

    await ctx.db.patch("teamInvites", invite._id, { acceptedAt: Date.now() });

    return { ok: true as const, teamId: invite.teamId };
  },
});

// ---------------------------------------------------------------------------
// Internal — invite email sending
// ---------------------------------------------------------------------------

export const sendInviteEmail = internalAction({
  args: {
    toEmail: v.string(),
    teamName: v.string(),
    token: v.string(),
    role: v.union(v.literal("admin"), v.literal("member")),
  },
  handler: async (ctx, args) => {
    const inviteUrl = `https://convalytics.dev/invite/${args.token}`;
    await resend.sendEmail(
      ctx,
      FROM,
      args.toEmail,
      `You've been invited to ${args.teamName} on Convalytics`,
      await render(
        InviteEmail({ teamName: args.teamName, inviteUrl, role: args.role }),
      ),
      undefined,
      REPLY_TO,
    );
  },
});

