/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const SESSION_EXPIRY = Date.now() + 30 * 24 * 60 * 60 * 1000;
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

async function setupOwner(
  t: ReturnType<typeof convexTest>,
  opts: { userId?: string; email?: string } = {},
): Promise<{ sessionToken: string; teamId: Id<"teams">; userId: string }> {
  const userId = opts.userId ?? "convex:1";
  const sessionToken = `session-${userId}`;
  let teamId!: Id<"teams">;

  await t.run(async (ctx) => {
    await ctx.db.insert("users", {
      userId,
      email: opts.email,
      createdAt: Date.now(),
    });

    teamId = await ctx.db.insert("teams", {
      convexTeamId: 1,
      name: "Test Team",
      slug: "test-team",
      plan: "free",
      usageLimitEventsPerMonth: 10_000,
      createdAt: Date.now(),
    });

    await ctx.db.insert("teamMembers", {
      teamId,
      userId,
      role: "owner",
      joinedAt: Date.now(),
    });

    await ctx.db.insert("sessions", {
      sessionToken,
      userId,
      managementToken: "test-mgmt-token",
      expiresAt: SESSION_EXPIRY,
    });
  });

  return { sessionToken, teamId, userId };
}

async function setupMember(
  t: ReturnType<typeof convexTest>,
  teamId: Id<"teams">,
  opts: { userId?: string; role?: "admin" | "member" } = {},
): Promise<{ sessionToken: string; userId: string }> {
  const userId = opts.userId ?? "convex:2";
  const sessionToken = `session-${userId}`;

  await t.run(async (ctx) => {
    await ctx.db.insert("users", { userId, createdAt: Date.now() });
    await ctx.db.insert("teamMembers", {
      teamId,
      userId,
      role: opts.role ?? "member",
      joinedAt: Date.now(),
    });
    await ctx.db.insert("sessions", {
      sessionToken,
      userId,
      expiresAt: SESSION_EXPIRY,
    });
  });

  return { sessionToken, userId };
}

// ---------------------------------------------------------------------------
// listMembers
// ---------------------------------------------------------------------------

describe("invites.listMembers", () => {
  test("returns members for the caller's team", async () => {
    const t = convexTest(schema, modules);
    const { sessionToken, teamId } = await setupOwner(t);
    await setupMember(t, teamId, { userId: "convex:2" });

    const result = await t.query(api.invites.listMembers, { sessionToken });

    expect(result).not.toBeNull();
    expect(result!.members).toHaveLength(2);
    expect(result!.myRole).toBe("owner");
  });

  test("returns null for invalid session", async () => {
    const t = convexTest(schema, modules);
    const result = await t.query(api.invites.listMembers, { sessionToken: "bad" });
    expect(result).toBeNull();
  });

  test("marks OAuth users correctly", async () => {
    const t = convexTest(schema, modules);
    const { sessionToken } = await setupOwner(t, { userId: "convex:1" });

    const result = await t.query(api.invites.listMembers, { sessionToken });
    expect(result!.members[0].isOAuth).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// createInvite
// ---------------------------------------------------------------------------

describe("invites.createInvite", () => {
  test("owner can invite a new member", async () => {
    const t = convexTest(schema, modules);
    const { sessionToken } = await setupOwner(t);

    const result = await t.mutation(api.invites.createInvite, {
      sessionToken,
      email: "alice@example.com",
      role: "member",
    });

    expect(result).toEqual({ ok: true });

    // Invite should appear in pending list
    const invites = await t.query(api.invites.listPendingInvites, { sessionToken });
    expect(invites).toHaveLength(1);
    expect(invites![0].invitedEmail).toBe("alice@example.com");
    expect(invites![0].role).toBe("member");
  });

  test("admin can invite", async () => {
    const t = convexTest(schema, modules);
    const { teamId } = await setupOwner(t);
    const { sessionToken } = await setupMember(t, teamId, {
      userId: "convex:2",
      role: "admin",
    });

    const result = await t.mutation(api.invites.createInvite, {
      sessionToken,
      email: "bob@example.com",
      role: "member",
    });

    expect(result).toEqual({ ok: true });
  });

  test("member cannot invite", async () => {
    const t = convexTest(schema, modules);
    const { teamId } = await setupOwner(t);
    const { sessionToken } = await setupMember(t, teamId, { userId: "convex:2", role: "member" });

    const result = await t.mutation(api.invites.createInvite, {
      sessionToken,
      email: "carol@example.com",
      role: "member",
    });

    expect(result).toEqual({ error: "Only owners and admins can invite members" });
  });

  test("duplicate invite returns error", async () => {
    const t = convexTest(schema, modules);
    const { sessionToken } = await setupOwner(t);

    await t.mutation(api.invites.createInvite, {
      sessionToken,
      email: "dave@example.com",
      role: "member",
    });

    const result = await t.mutation(api.invites.createInvite, {
      sessionToken,
      email: "dave@example.com",
      role: "member",
    });

    expect(result).toEqual({ error: "A pending invite already exists for this email" });
  });

  test("existing team member returns error", async () => {
    const t = convexTest(schema, modules);
    const { sessionToken, teamId } = await setupOwner(t);

    // Add an existing member with a known email
    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        userId: "invited:eve@example.com",
        email: "eve@example.com",
        createdAt: Date.now(),
      });
      await ctx.db.insert("teamMembers", {
        teamId,
        userId: "invited:eve@example.com",
        role: "member",
        joinedAt: Date.now(),
      });
    });

    const result = await t.mutation(api.invites.createInvite, {
      sessionToken,
      email: "eve@example.com",
      role: "member",
    });

    expect(result).toEqual({ error: "This person is already a team member" });
  });

  test("email is normalized to lowercase", async () => {
    const t = convexTest(schema, modules);
    const { sessionToken } = await setupOwner(t);

    await t.mutation(api.invites.createInvite, {
      sessionToken,
      email: "Frank@Example.COM",
      role: "member",
    });

    const invites = await t.query(api.invites.listPendingInvites, { sessionToken });
    expect(invites![0].invitedEmail).toBe("frank@example.com");
  });

  test("invalid session returns error", async () => {
    const t = convexTest(schema, modules);
    const result = await t.mutation(api.invites.createInvite, {
      sessionToken: "bad",
      email: "test@example.com",
      role: "member",
    });
    expect(result).toEqual({ error: "Unauthorized" });
  });
});

// ---------------------------------------------------------------------------
// listPendingInvites
// ---------------------------------------------------------------------------

describe("invites.listPendingInvites", () => {
  test("excludes accepted invites", async () => {
    const t = convexTest(schema, modules);
    const { sessionToken, teamId } = await setupOwner(t);

    await t.run(async (ctx) => {
      await ctx.db.insert("teamInvites", {
        teamId,
        invitedEmail: "accepted@example.com",
        token: "tok1",
        role: "member",
        invitedBy: "convex:1",
        expiresAt: Date.now() + INVITE_TTL_MS,
        acceptedAt: Date.now() - 1000,
      });
    });

    const invites = await t.query(api.invites.listPendingInvites, { sessionToken });
    expect(invites).toHaveLength(0);
  });

  test("excludes expired invites", async () => {
    const t = convexTest(schema, modules);
    const { sessionToken, teamId } = await setupOwner(t);

    await t.run(async (ctx) => {
      await ctx.db.insert("teamInvites", {
        teamId,
        invitedEmail: "expired@example.com",
        token: "tok2",
        role: "member",
        invitedBy: "convex:1",
        expiresAt: Date.now() - 1000, // already expired
      });
    });

    const invites = await t.query(api.invites.listPendingInvites, { sessionToken });
    expect(invites).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// revokeInvite
// ---------------------------------------------------------------------------

describe("invites.revokeInvite", () => {
  test("owner can revoke a pending invite", async () => {
    const t = convexTest(schema, modules);
    const { sessionToken } = await setupOwner(t);

    await t.mutation(api.invites.createInvite, {
      sessionToken,
      email: "revoke@example.com",
      role: "member",
    });

    const invitesBefore = await t.query(api.invites.listPendingInvites, { sessionToken });
    expect(invitesBefore).toHaveLength(1);
    const inviteId = invitesBefore![0]._id;

    const result = await t.mutation(api.invites.revokeInvite, {
      sessionToken,
      inviteId,
    });
    expect(result).toEqual({ ok: true });

    const invitesAfter = await t.query(api.invites.listPendingInvites, { sessionToken });
    expect(invitesAfter).toHaveLength(0);
  });

  test("member cannot revoke", async () => {
    const t = convexTest(schema, modules);
    const { sessionToken: ownerSession, teamId } = await setupOwner(t);
    const { sessionToken: memberSession } = await setupMember(t, teamId, { userId: "convex:2" });

    await t.mutation(api.invites.createInvite, {
      sessionToken: ownerSession,
      email: "target@example.com",
      role: "member",
    });

    const invites = await t.query(api.invites.listPendingInvites, { sessionToken: ownerSession });
    const inviteId = invites![0]._id;

    const result = await t.mutation(api.invites.revokeInvite, {
      sessionToken: memberSession,
      inviteId,
    });
    expect(result).toEqual({ error: "Only owners and admins can revoke invites" });
  });
});

// ---------------------------------------------------------------------------
// getInviteByToken
// ---------------------------------------------------------------------------

describe("invites.getInviteByToken", () => {
  test("returns valid invite details", async () => {
    const t = convexTest(schema, modules);
    const { sessionToken } = await setupOwner(t);

    await t.mutation(api.invites.createInvite, {
      sessionToken,
      email: "newuser@example.com",
      role: "admin",
    });

    const invites = await t.query(api.invites.listPendingInvites, { sessionToken });
    const token = await t.run(async (ctx) => {
      const invite = await ctx.db.get("teamInvites", invites![0]._id);
      return invite!.token;
    });

    const result = await t.query(api.invites.getInviteByToken, { token });
    expect(result.status).toBe("valid");
    if (result.status === "valid") {
      expect(result.invitedEmail).toBe("newuser@example.com");
      expect(result.role).toBe("admin");
      expect(result.teamName).toBe("Test Team");
    }
  });

  test("returns not_found for unknown token", async () => {
    const t = convexTest(schema, modules);
    const result = await t.query(api.invites.getInviteByToken, { token: "doesnotexist" });
    expect(result.status).toBe("not_found");
  });

  test("returns already_accepted for used invite", async () => {
    const t = convexTest(schema, modules);
    const { teamId } = await setupOwner(t);

    await t.run(async (ctx) => {
      await ctx.db.insert("teamInvites", {
        teamId,
        invitedEmail: "used@example.com",
        token: "used-token",
        role: "member",
        invitedBy: "convex:1",
        expiresAt: Date.now() + INVITE_TTL_MS,
        acceptedAt: Date.now() - 1000,
      });
    });

    const result = await t.query(api.invites.getInviteByToken, { token: "used-token" });
    expect(result.status).toBe("already_accepted");
  });

  test("returns expired for old invite", async () => {
    const t = convexTest(schema, modules);
    const { teamId } = await setupOwner(t);

    await t.run(async (ctx) => {
      await ctx.db.insert("teamInvites", {
        teamId,
        invitedEmail: "old@example.com",
        token: "old-token",
        role: "member",
        invitedBy: "convex:1",
        expiresAt: Date.now() - 1000,
      });
    });

    const result = await t.query(api.invites.getInviteByToken, { token: "old-token" });
    expect(result.status).toBe("expired");
  });
});

// ---------------------------------------------------------------------------
// finalizeInviteAccept (internal mutation — tests bypass hashing)
// ---------------------------------------------------------------------------

describe("invites.finalizeInviteAccept", () => {
  test("creates user, team membership, and session on acceptance", async () => {
    const t = convexTest(schema, modules);
    const { teamId } = await setupOwner(t);

    const token = "accept-token-1";
    await t.run(async (ctx) => {
      await ctx.db.insert("teamInvites", {
        teamId,
        invitedEmail: "invited@example.com",
        token,
        role: "member",
        invitedBy: "convex:1",
        expiresAt: Date.now() + INVITE_TTL_MS,
      });
    });

    const result = await t.mutation(internal.invites.finalizeInviteAccept, {
      token,
      passwordHash: "fakesalt:fakehash",
      name: "Invited User",
      sessionToken: "new-session-tok",
      expiresAt: SESSION_EXPIRY,
    });

    expect(result).toEqual({ ok: true, sessionToken: "new-session-tok" });

    // Verify user was created
    const user = await t.run((ctx) =>
      ctx.db.query("users").withIndex("by_userId", (q) => q.eq("userId", "invited:invited@example.com")).unique()
    );
    expect(user).not.toBeNull();
    expect(user!.email).toBe("invited@example.com");
    expect(user!.name).toBe("Invited User");
    expect(user!.passwordHash).toBe("fakesalt:fakehash");

    // Verify team membership
    const membership = await t.run((ctx) =>
      ctx.db.query("teamMembers")
        .withIndex("by_teamId_and_userId", (q) =>
          q.eq("teamId", teamId).eq("userId", "invited:invited@example.com"))
        .unique()
    );
    expect(membership).not.toBeNull();
    expect(membership!.role).toBe("member");

    // Verify session was created
    const session = await t.run((ctx) =>
      ctx.db.query("sessions").withIndex("by_userId", (q) => q.eq("userId", "invited:invited@example.com")).unique()
    );
    expect(session).not.toBeNull();
    expect(session!.sessionToken).toBe("new-session-tok");

    // Verify invite was marked accepted
    const invite = await t.run((ctx) =>
      ctx.db.query("teamInvites").withIndex("by_token", (q) => q.eq("token", token)).unique()
    );
    expect(invite!.acceptedAt).toBeDefined();
  });

  test("rejects already-accepted invite", async () => {
    const t = convexTest(schema, modules);
    const { teamId } = await setupOwner(t);
    const token = "accept-token-2";

    await t.run(async (ctx) => {
      await ctx.db.insert("teamInvites", {
        teamId,
        invitedEmail: "used2@example.com",
        token,
        role: "member",
        invitedBy: "convex:1",
        expiresAt: Date.now() + INVITE_TTL_MS,
        acceptedAt: Date.now() - 1000,
      });
    });

    const result = await t.mutation(internal.invites.finalizeInviteAccept, {
      token,
      passwordHash: "x:y",
      sessionToken: "s",
      expiresAt: SESSION_EXPIRY,
    });
    expect(result).toEqual({ error: "Invite already accepted" });
  });

  test("rejects expired invite", async () => {
    const t = convexTest(schema, modules);
    const { teamId } = await setupOwner(t);
    const token = "expired-token";

    await t.run(async (ctx) => {
      await ctx.db.insert("teamInvites", {
        teamId,
        invitedEmail: "late@example.com",
        token,
        role: "member",
        invitedBy: "convex:1",
        expiresAt: Date.now() - 1000,
      });
    });

    const result = await t.mutation(internal.invites.finalizeInviteAccept, {
      token,
      passwordHash: "x:y",
      sessionToken: "s",
      expiresAt: SESSION_EXPIRY,
    });
    expect(result).toEqual({ error: "Invite has expired" });
  });

  test("rotates session if user already has one", async () => {
    const t = convexTest(schema, modules);
    const { teamId } = await setupOwner(t);
    const token = "accept-token-3";
    const userId = "invited:repeat@example.com";

    await t.run(async (ctx) => {
      await ctx.db.insert("teamInvites", {
        teamId,
        invitedEmail: "repeat@example.com",
        token,
        role: "member",
        invitedBy: "convex:1",
        expiresAt: Date.now() + INVITE_TTL_MS,
      });
      // Pre-existing user (e.g. re-invited after removal)
      await ctx.db.insert("users", {
        userId,
        email: "repeat@example.com",
        passwordHash: "old:hash",
        createdAt: Date.now(),
      });
      await ctx.db.insert("sessions", {
        sessionToken: "old-session",
        userId,
        expiresAt: SESSION_EXPIRY,
      });
    });

    const result = await t.mutation(internal.invites.finalizeInviteAccept, {
      token,
      passwordHash: "new:hash",
      sessionToken: "new-session",
      expiresAt: SESSION_EXPIRY,
    });

    expect(result).toEqual({ ok: true, sessionToken: "new-session" });

    // Session should be updated, not duplicated
    const sessions = await t.run((ctx) =>
      ctx.db.query("sessions").withIndex("by_userId", (q) => q.eq("userId", userId)).collect()
    );
    expect(sessions).toHaveLength(1);
    expect(sessions[0].sessionToken).toBe("new-session");
  });
});

// ---------------------------------------------------------------------------
// removeMember
// ---------------------------------------------------------------------------

describe("invites.removeMember", () => {
  test("owner can remove a member", async () => {
    const t = convexTest(schema, modules);
    const { sessionToken, teamId } = await setupOwner(t);
    const { userId: memberId } = await setupMember(t, teamId, { userId: "convex:2" });

    const result = await t.mutation(api.invites.removeMember, {
      sessionToken,
      targetUserId: memberId,
    });
    expect(result).toEqual({ ok: true });

    const members = await t.query(api.invites.listMembers, { sessionToken });
    expect(members!.members).toHaveLength(1);
  });

  test("cannot remove the last owner", async () => {
    const t = convexTest(schema, modules);
    const { sessionToken, userId } = await setupOwner(t);

    const result = await t.mutation(api.invites.removeMember, {
      sessionToken,
      targetUserId: userId,
    });
    expect(result).toEqual({ error: "Cannot remove the last owner" });
  });

  test("member cannot remove another member", async () => {
    const t = convexTest(schema, modules);
    const { teamId } = await setupOwner(t);
    const { sessionToken } = await setupMember(t, teamId, { userId: "convex:2" });
    await setupMember(t, teamId, { userId: "convex:3" });

    const result = await t.mutation(api.invites.removeMember, {
      sessionToken,
      targetUserId: "convex:3",
    });
    expect(result).toEqual({ error: "Only owners can remove other members" });
  });

  test("member can remove themselves", async () => {
    const t = convexTest(schema, modules);
    const { teamId } = await setupOwner(t);
    const { sessionToken, userId } = await setupMember(t, teamId, { userId: "convex:2" });

    const result = await t.mutation(api.invites.removeMember, {
      sessionToken,
      targetUserId: userId,
    });
    expect(result).toEqual({ ok: true });
  });
});

// ---------------------------------------------------------------------------
// createInvitedSession (internal mutation)
// ---------------------------------------------------------------------------

describe("invites.createInvitedSession", () => {
  test("creates a new session for invited user", async () => {
    const t = convexTest(schema, modules);

    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        userId: "invited:fresh@example.com",
        email: "fresh@example.com",
        passwordHash: "s:h",
        createdAt: Date.now(),
      });
    });

    const result = await t.mutation(internal.invites.createInvitedSession, {
      userId: "invited:fresh@example.com",
      sessionToken: "fresh-session",
      expiresAt: SESSION_EXPIRY,
    });

    expect(result.sessionToken).toBe("fresh-session");
  });

  test("rotates existing session", async () => {
    const t = convexTest(schema, modules);
    const userId = "invited:rotate@example.com";

    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        userId,
        email: "rotate@example.com",
        passwordHash: "s:h",
        createdAt: Date.now(),
      });
      await ctx.db.insert("sessions", {
        sessionToken: "old-tok",
        userId,
        expiresAt: SESSION_EXPIRY,
      });
    });

    await t.mutation(internal.invites.createInvitedSession, {
      userId,
      sessionToken: "new-tok",
      expiresAt: SESSION_EXPIRY,
    });

    const sessions = await t.run((ctx) =>
      ctx.db.query("sessions").withIndex("by_userId", (q) => q.eq("userId", userId)).collect()
    );
    expect(sessions).toHaveLength(1);
    expect(sessions[0].sessionToken).toBe("new-tok");
  });
});

// ---------------------------------------------------------------------------
// getUserForSignIn (internal query)
// ---------------------------------------------------------------------------

describe("invites.getUserForSignIn", () => {
  test("returns user with passwordHash", async () => {
    const t = convexTest(schema, modules);

    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        userId: "invited:findme@example.com",
        email: "findme@example.com",
        passwordHash: "salt:hash",
        createdAt: Date.now(),
      });
    });

    const user = await t.query(internal.invites.getUserForSignIn, {
      email: "findme@example.com",
    });

    expect(user).not.toBeNull();
    expect(user!.userId).toBe("invited:findme@example.com");
    expect(user!.passwordHash).toBe("salt:hash");
  });

  test("returns null for OAuth-only users (no passwordHash)", async () => {
    const t = convexTest(schema, modules);
    await setupOwner(t, { userId: "convex:1", email: "owner@example.com" });

    const user = await t.query(internal.invites.getUserForSignIn, {
      email: "owner@example.com",
    });
    expect(user).toBeNull();
  });

  test("returns null for unknown email", async () => {
    const t = convexTest(schema, modules);
    const user = await t.query(internal.invites.getUserForSignIn, {
      email: "nobody@example.com",
    });
    expect(user).toBeNull();
  });
});
