/**
 * Team invite flow for non-Convex-OAuth users.
 *
 * Owners/admins send email invites. Invitees click the link, set a password,
 * and get a session. Subsequent sign-ins use email + password.
 *
 * Password hashing is done in actions (full crypto APIs). Database writes are
 * in internal mutations so they're testable independently.
 */

import { v } from "convex/values";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { Resend } from "@convex-dev/resend";
import { components } from "./_generated/api";
import { validateSession, getTeamMembership } from "./authHelpers";
import { render } from "@react-email/render";
import { InviteEmail } from "./emails/InviteEmail";

const resend = new Resend(components.resend, { testMode: false });

const FROM = "Convalytics <notifications@convalytics.dev>";
const REPLY_TO = ["dancleary54@gmail.com"];
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** List all team members with user details. */
export const listMembers = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const session = await validateSession(ctx, args.sessionToken);
    if (!session) return null;

    const memberships = await ctx.db
      .query("teamMembers")
      .withIndex("by_userId", (q) => q.eq("userId", session.userId))
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
        const user = await ctx.db
          .query("users")
          .withIndex("by_userId", (q) => q.eq("userId", m.userId))
          .unique();
        return {
          userId: m.userId,
          role: m.role,
          joinedAt: m.joinedAt,
          email: user?.email ?? null,
          name: user?.name ?? null,
          isOAuth: m.userId.startsWith("convex:"),
        };
      }),
    );

    const myMembership = memberships.find((m) => m.teamId === teamId);
    return { teamId, members, myRole: myMembership?.role ?? "member" };
  },
});

/** List pending (not yet accepted, not expired) invites for the caller's team. */
export const listPendingInvites = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const session = await validateSession(ctx, args.sessionToken);
    if (!session) return null;

    const membership = await ctx.db
      .query("teamMembers")
      .withIndex("by_userId", (q) => q.eq("userId", session.userId))
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
    const invite = await ctx.db
      .query("teamInvites")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();

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
    sessionToken: v.string(),
    email: v.string(),
    role: v.union(v.literal("admin"), v.literal("member")),
  },
  handler: async (ctx, args) => {
    const session = await validateSession(ctx, args.sessionToken);
    if (!session) return { error: "Unauthorized" };

    const membership = await ctx.db
      .query("teamMembers")
      .withIndex("by_userId", (q) => q.eq("userId", session.userId))
      .first();
    if (!membership) return { error: "Not a team member" };
    if (membership.role === "member") return { error: "Only owners and admins can invite members" };

    const teamId = membership.teamId;
    const email = args.email.toLowerCase().trim();
    const now = Date.now();

    // Check if user is already a member
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    if (existingUser) {
      const existingMembership = await getTeamMembership(ctx, teamId, existingUser.userId);
      if (existingMembership) return { error: "This person is already a team member" };
    }

    // Check for a pending (non-expired, non-accepted) invite to the same email
    const existing = await ctx.db
      .query("teamInvites")
      .withIndex("by_teamId_and_email", (q) =>
        q.eq("teamId", teamId).eq("invitedEmail", email),
      )
      .filter((q) =>
        q.and(q.eq(q.field("acceptedAt"), undefined), q.gt(q.field("expiresAt"), now)),
      )
      .first();
    if (existing) return { error: "A pending invite already exists for this email" };

    const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");

    await ctx.db.insert("teamInvites", {
      teamId,
      invitedEmail: email,
      token,
      role: args.role,
      invitedBy: session.userId,
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
  args: {
    sessionToken: v.string(),
    inviteId: v.id("teamInvites"),
  },
  handler: async (ctx, args) => {
    const session = await validateSession(ctx, args.sessionToken);
    if (!session) return { error: "Unauthorized" };

    const membership = await ctx.db
      .query("teamMembers")
      .withIndex("by_userId", (q) => q.eq("userId", session.userId))
      .first();
    if (!membership) return { error: "Not a team member" };
    if (membership.role === "member") return { error: "Only owners and admins can revoke invites" };

    const invite = await ctx.db.get("teamInvites", args.inviteId);
    if (!invite) return { error: "Invite not found" };
    if (invite.teamId !== membership.teamId) return { error: "Invite belongs to a different team" };

    await ctx.db.delete("teamInvites", args.inviteId);
    return { ok: true };
  },
});

/** Remove a team member. Only owners can remove others; anyone can remove themselves. */
export const removeMember = mutation({
  args: {
    sessionToken: v.string(),
    targetUserId: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await validateSession(ctx, args.sessionToken);
    if (!session) return { error: "Unauthorized" };

    const myMembership = await ctx.db
      .query("teamMembers")
      .withIndex("by_userId", (q) => q.eq("userId", session.userId))
      .first();
    if (!myMembership) return { error: "Not a team member" };

    // Only owners can remove others (anyone can remove themselves)
    if (args.targetUserId !== session.userId && myMembership.role !== "owner") {
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

// ---------------------------------------------------------------------------
// Internal — called by actions, testable directly
// ---------------------------------------------------------------------------

/** Store accepted invite: create/update user with password hash, add to team, create session. */
export const finalizeInviteAccept = internalMutation({
  args: {
    token: v.string(),
    passwordHash: v.string(),
    name: v.optional(v.string()),
    sessionToken: v.string(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const invite = await ctx.db
      .query("teamInvites")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();

    if (!invite) return { error: "Invite not found" };
    if (invite.acceptedAt) return { error: "Invite already accepted" };
    if (invite.expiresAt < Date.now()) return { error: "Invite has expired" };

    const email = invite.invitedEmail;
    const userId = `invited:${email}`;
    const now = Date.now();

    // Create or update user
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();

    if (existingUser) {
      await ctx.db.patch("users", existingUser._id, {
        passwordHash: args.passwordHash,
        ...(args.name ? { name: args.name } : {}),
      });
    } else {
      await ctx.db.insert("users", {
        userId,
        email,
        name: args.name,
        passwordHash: args.passwordHash,
        createdAt: now,
      });
    }

    // Add to team
    const existingMembership = await getTeamMembership(ctx, invite.teamId, userId);
    if (!existingMembership) {
      await ctx.db.insert("teamMembers", {
        teamId: invite.teamId,
        userId,
        role: invite.role,
        joinedAt: now,
      });
    }

    // Mark invite accepted
    await ctx.db.patch("teamInvites", invite._id, { acceptedAt: now });

    // Create session
    const existingSession = await ctx.db
      .query("sessions")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();

    if (existingSession) {
      await ctx.db.patch("sessions", existingSession._id, {
        sessionToken: args.sessionToken,
        expiresAt: args.expiresAt,
      });
    } else {
      await ctx.db.insert("sessions", {
        sessionToken: args.sessionToken,
        userId,
        expiresAt: args.expiresAt,
      });
    }

    return { ok: true, sessionToken: args.sessionToken };
  },
});

/** Look up user by email and return their stored password hash. */
export const getUserForSignIn = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email.toLowerCase().trim()))
      .unique();
    if (!user || !user.passwordHash) return null;
    return { userId: user.userId, passwordHash: user.passwordHash };
  },
});

/** Create or rotate a session for an invited user after password verification. */
export const createInvitedSession = internalMutation({
  args: {
    userId: v.string(),
    sessionToken: v.string(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("sessions")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();

    if (existing) {
      await ctx.db.patch("sessions", existing._id, {
        sessionToken: args.sessionToken,
        expiresAt: args.expiresAt,
      });
    } else {
      await ctx.db.insert("sessions", {
        sessionToken: args.sessionToken,
        userId: args.userId,
        expiresAt: args.expiresAt,
      });
    }

    return { sessionToken: args.sessionToken };
  },
});

// ---------------------------------------------------------------------------
// Actions — password hashing lives here (full crypto APIs)
// ---------------------------------------------------------------------------

/** Hash a password with PBKDF2-SHA256 and a random salt. */
async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomUUID().replace(/-/g, "");
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: enc.encode(salt), iterations: 100_000, hash: "SHA-256" },
    keyMaterial,
    256,
  );
  const hash = Array.from(new Uint8Array(bits))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${salt}:${hash}`;
}

/** Verify a password against a stored hash. */
async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, expectedHash] = stored.split(":");
  if (!salt || !expectedHash) return false;
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: enc.encode(salt), iterations: 100_000, hash: "SHA-256" },
    keyMaterial,
    256,
  );
  const hash = Array.from(new Uint8Array(bits))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hash === expectedHash;
}

/** Accept an invite by setting a password. Returns a session token. */
export const acceptInviteWithPassword = action({
  args: {
    token: v.string(),
    password: v.string(),
    name: v.optional(v.string()),
  },
  returns: v.union(
    v.object({ ok: v.literal(true), sessionToken: v.string() }),
    v.object({ error: v.string() }),
  ),
  handler: async (ctx, args): Promise<{ ok: true; sessionToken: string } | { error: string }> => {
    if (args.password.length < 8) {
      return { error: "Password must be at least 8 characters" };
    }

    const passwordHash = await hashPassword(args.password);
    const sessionToken = crypto.randomUUID();
    const expiresAt = Date.now() + SESSION_TTL_MS;

    const result = await ctx.runMutation(internal.invites.finalizeInviteAccept, {
      token: args.token,
      passwordHash,
      name: args.name,
      sessionToken,
      expiresAt,
    });

    if ("error" in result) return { error: result.error ?? "Unknown error" };
    return { ok: true, sessionToken: result.sessionToken };
  },
});

/** Sign in with email + password (for invited users). Returns a session token. */
export const signInWithPassword = action({
  args: {
    email: v.string(),
    password: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.runQuery(internal.invites.getUserForSignIn, {
      email: args.email,
    });

    if (!user) return { error: "Invalid email or password" };

    const valid = await verifyPassword(args.password, user.passwordHash);
    if (!valid) return { error: "Invalid email or password" };

    const sessionToken = crypto.randomUUID();
    const expiresAt = Date.now() + SESSION_TTL_MS;

    await ctx.runMutation(internal.invites.createInvitedSession, {
      userId: user.userId,
      sessionToken,
      expiresAt,
    });

    return { ok: true, sessionToken };
  },
});

// ---------------------------------------------------------------------------
// Internal action — email sending
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
      await render(InviteEmail({ teamName: args.teamName, inviteUrl, role: args.role })),
      undefined,
      REPLY_TO,
    );
  },
});
