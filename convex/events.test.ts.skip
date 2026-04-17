/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

// Session TTL: 30 days from now
const SESSION_EXPIRY = Date.now() + 30 * 24 * 60 * 60 * 1000;

// Helper: create a test user, team, membership, and session
async function setupSession(
  t: ReturnType<typeof convexTest>,
  userId = "user1",
): Promise<{ sessionToken: string; teamId: Id<"teams"> }> {
  const sessionToken = `test-session-${userId}`;
  let teamId: Id<"teams">;

  await t.run(async (ctx) => {
    // Create user
    await ctx.db.insert("users", {
      userId,
      createdAt: Date.now(),
    });

    // Create team
    teamId = await ctx.db.insert("teams", {
      convexTeamId: parseInt(userId.replace("user", "")) || 1,
      name: `Team for ${userId}`,
      slug: `team-${userId}`,
      plan: "free",
      usageLimitEventsPerMonth: 10000,
      createdAt: Date.now(),
    });

    // Add user to team as owner
    await ctx.db.insert("teamMembers", {
      teamId,
      userId,
      role: "owner",
      joinedAt: Date.now(),
    });

    // Create session
    await ctx.db.insert("sessions", {
      sessionToken,
      userId,
      managementToken: "test-management-token",
      expiresAt: SESSION_EXPIRY,
    });
  });

  return { sessionToken, teamId: teamId! };
}

// Helper: create a project and return its writeKey
async function setupProject(
  t: ReturnType<typeof convexTest>,
  sessionToken: string,
  teamId: Id<"teams">,
  name = "test-project",
) {
  return await t.mutation(api.projects.create, { sessionToken, teamId, name });
}

// Helper: ingest an event directly via internal mutation
async function ingestEvent(
  t: ReturnType<typeof convexTest>,
  writeKey: string,
  overrides: Partial<{
    name: string;
    visitorId: string;
    sessionId: string;
    timestamp: number;
    props: Record<string, string | number | boolean>;
  }> = {},
) {
  await t.mutation(internal.events.ingest, {
    writeKey,
    name: overrides.name ?? "page_view",
    visitorId: overrides.visitorId ?? "visitor_1",
    sessionId: overrides.sessionId ?? "session_1",
    timestamp: overrides.timestamp ?? Date.now(),
    props: overrides.props ?? {},
  });
}

describe("projects", () => {
  test("create returns a write key", async () => {
    const t = convexTest(schema, modules);
    const { sessionToken, teamId } = await setupSession(t, "user1");
    const writeKey = await t.mutation(api.projects.create, {
      sessionToken,
      teamId,
      name: "my-app",
    });
    expect(typeof writeKey).toBe("string");
    expect(writeKey.length).toBeGreaterThan(0);
  });

  test("list returns only the authenticated user's team projects", async () => {
    const t = convexTest(schema, modules);

    const { sessionToken: token1, teamId: teamId1 } = await setupSession(t, "user1");
    const { sessionToken: token2, teamId: teamId2 } = await setupSession(t, "user2");

    await t.mutation(api.projects.create, { sessionToken: token1, teamId: teamId1, name: "user1-project" });
    await t.mutation(api.projects.create, { sessionToken: token2, teamId: teamId2, name: "user2-project" });

    const user1Projects = await t.query(api.projects.list, { sessionToken: token1 });
    const user2Projects = await t.query(api.projects.list, { sessionToken: token2 });

    expect(user1Projects).toHaveLength(1);
    expect(user1Projects[0].name).toBe("user1-project");

    expect(user2Projects).toHaveLength(1);
    expect(user2Projects[0].name).toBe("user2-project");
  });

  test("list returns null for invalid session token", async () => {
    const t = convexTest(schema, modules);
    const { sessionToken, teamId } = await setupSession(t, "user1");
    await t.mutation(api.projects.create, { sessionToken, teamId, name: "my-app" });

    const projects = await t.query(api.projects.list, {
      sessionToken: "invalid-token",
    });
    expect(projects).toBeNull();
  });
});

describe("events.ingest", () => {
  test("stores event with correct fields", async () => {
    const t = convexTest(schema, modules);
    const { sessionToken, teamId } = await setupSession(t, "user1");
    const writeKey = await setupProject(t, sessionToken, teamId, "my-app");

    const ts = Date.now();
    await ingestEvent(t, writeKey, {
      name: "page_view",
      visitorId: "visitor_abc",
      sessionId: "sess_xyz",
      timestamp: ts,
      props: { path: "/home" },
    });

    const events = await t.query(api.events.listLatest, { sessionToken, writeKey });
    expect(events).toHaveLength(1);
    expect(events[0].name).toBe("page_view");
    expect(events[0].visitorId).toBe("visitor_abc");
    expect(events[0].sessionId).toBe("sess_xyz");
    expect(events[0].timestamp).toBe(ts);
    expect(events[0].props).toEqual({ path: "/home" });
  });

  test("stores AI events with ai_ prefix intact", async () => {
    const t = convexTest(schema, modules);
    const { sessionToken, teamId } = await setupSession(t, "user1");
    const writeKey = await setupProject(t, sessionToken, teamId, "my-app");

    await ingestEvent(t, writeKey, {
      name: "ai_completion",
      props: { model: "gpt-4o", input_tokens: 100, output_tokens: 200, latency_ms: 1400 },
    });

    const events = await t.query(api.events.listLatest, { sessionToken, writeKey });
    expect(events[0].name).toBe("ai_completion");
    expect(events[0].props.model).toBe("gpt-4o");
    expect(events[0].props.input_tokens).toBe(100);
  });
});

describe("events.listLatest", () => {
  test("returns events in descending timestamp order", async () => {
    const t = convexTest(schema, modules);
    const { sessionToken, teamId } = await setupSession(t, "user1");
    const writeKey = await setupProject(t, sessionToken, teamId, "my-app");

    const now = Date.now();
    await ingestEvent(t, writeKey, { timestamp: now - 2000, name: "first" });
    await ingestEvent(t, writeKey, { timestamp: now - 1000, name: "second" });
    await ingestEvent(t, writeKey, { timestamp: now, name: "third" });

    const events = await t.query(api.events.listLatest, { sessionToken, writeKey });
    expect(events[0].name).toBe("third");
    expect(events[1].name).toBe("second");
    expect(events[2].name).toBe("first");
  });

  test("respects limit argument", async () => {
    const t = convexTest(schema, modules);
    const { sessionToken, teamId } = await setupSession(t, "user1");
    const writeKey = await setupProject(t, sessionToken, teamId, "my-app");

    for (let i = 0; i < 10; i++) {
      await ingestEvent(t, writeKey, { name: `event_${i}` });
    }

    const events = await t.query(api.events.listLatest, {
      sessionToken,
      writeKey,
      limit: 3,
    });
    expect(events).toHaveLength(3);
  });

  test("auth boundary: cannot read another team's events", async () => {
    const t = convexTest(schema, modules);
    const { sessionToken: token1, teamId: teamId1 } = await setupSession(t, "user1");
    const { sessionToken: token2 } = await setupSession(t, "user2");

    const writeKey = await setupProject(t, token1, teamId1, "my-app");
    await ingestEvent(t, writeKey, { name: "secret_event" });

    // user2 queries with user1's write key — should get nothing (not on that team)
    const events = await t.query(api.events.listLatest, {
      sessionToken: token2,
      writeKey,
    });
    expect(events).toEqual([]);
  });

  test("invalid session token gets empty list", async () => {
    const t = convexTest(schema, modules);
    const { sessionToken, teamId } = await setupSession(t, "user1");
    const writeKey = await setupProject(t, sessionToken, teamId, "my-app");
    await ingestEvent(t, writeKey);

    const events = await t.query(api.events.listLatest, {
      sessionToken: "bad-token",
      writeKey,
    });
    expect(events).toEqual([]);
  });
});

describe("events.topEventNames", () => {
  test("returns events sorted by count descending", async () => {
    const t = convexTest(schema, modules);
    const { sessionToken, teamId } = await setupSession(t, "user1");
    const writeKey = await setupProject(t, sessionToken, teamId, "my-app");

    // page_view x3, click x2, signup x1
    for (let i = 0; i < 3; i++) await ingestEvent(t, writeKey, { name: "page_view" });
    for (let i = 0; i < 2; i++) await ingestEvent(t, writeKey, { name: "click" });
    await ingestEvent(t, writeKey, { name: "signup" });

    const top = await t.query(api.events.topEventNames, { sessionToken, writeKey });
    expect(top[0]).toEqual({ name: "page_view", count: 3 });
    expect(top[1]).toEqual({ name: "click", count: 2 });
    expect(top[2]).toEqual({ name: "signup", count: 1 });
  });

  test("auth boundary: returns empty for wrong team", async () => {
    const t = convexTest(schema, modules);
    const { sessionToken: token1, teamId: teamId1 } = await setupSession(t, "user1");
    const { sessionToken: token2 } = await setupSession(t, "user2");

    const writeKey = await setupProject(t, token1, teamId1, "my-app");
    await ingestEvent(t, writeKey, { name: "page_view" });

    const top = await t.query(api.events.topEventNames, {
      sessionToken: token2,
      writeKey,
    });
    expect(top).toEqual([]);
  });
});

describe("team sharing", () => {
  test("users on the same team can access the same project", async () => {
    const t = convexTest(schema, modules);

    // Create a team and first user
    const { sessionToken: token1, teamId } = await setupSession(t, "user1");

    // Add a second user to the same team
    const token2 = `test-session-user2`;
    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        userId: "user2",
        createdAt: Date.now(),
      });
      await ctx.db.insert("teamMembers", {
        teamId,
        userId: "user2",
        role: "member",
        joinedAt: Date.now(),
      });
      await ctx.db.insert("sessions", {
        sessionToken: token2,
        userId: "user2",
        managementToken: "test-management-token",
        expiresAt: SESSION_EXPIRY,
      });
    });

    // User1 creates a project
    const writeKey = await setupProject(t, token1, teamId, "shared-project");
    await ingestEvent(t, writeKey, { name: "team_event" });

    // User2 should be able to see the events (same team)
    const events = await t.query(api.events.listLatest, {
      sessionToken: token2,
      writeKey,
    });
    expect(events).toHaveLength(1);
    expect(events[0].name).toBe("team_event");
  });

  test("users on different teams cannot access each other's projects", async () => {
    const t = convexTest(schema, modules);

    const { sessionToken: token1, teamId: teamId1 } = await setupSession(t, "user1");
    const { sessionToken: token2 } = await setupSession(t, "user2");

    const writeKey = await setupProject(t, token1, teamId1, "private-project");
    await ingestEvent(t, writeKey, { name: "private_event" });

    // User2 should NOT see events (different team)
    const events = await t.query(api.events.listLatest, {
      sessionToken: token2,
      writeKey,
    });
    expect(events).toEqual([]);
  });
});

describe("events.ingestBatch", () => {
  test("inserts all events in the batch", async () => {
    const t = convexTest(schema, modules);
    const { sessionToken, teamId } = await setupSession(t, "user1");
    const writeKey = await setupProject(t, sessionToken, teamId, "my-app");

    const now = Date.now();
    await t.mutation(internal.events.ingestBatch, {
      events: [
        { writeKey, name: "step_started", visitorId: "u1", sessionId: "s1", timestamp: now, props: { step: "validate" } },
        { writeKey, name: "step_completed", visitorId: "u1", sessionId: "s1", timestamp: now + 100, props: {} },
        { writeKey, name: "step_started", visitorId: "u2", sessionId: "s2", timestamp: now + 200, props: { step: "process" } },
      ],
    });

    const events = await t.query(api.events.listLatest, { sessionToken, writeKey });
    expect(events).toHaveLength(3);
  });

  test("empty batch inserts nothing", async () => {
    const t = convexTest(schema, modules);
    const { sessionToken, teamId } = await setupSession(t, "user1");
    const writeKey = await setupProject(t, sessionToken, teamId, "my-app");

    await t.mutation(internal.events.ingestBatch, { events: [] });

    const events = await t.query(api.events.listLatest, { sessionToken, writeKey });
    expect(events).toHaveLength(0);
  });

  test("preserves props on each event", async () => {
    const t = convexTest(schema, modules);
    const { sessionToken, teamId } = await setupSession(t, "user1");
    const writeKey = await setupProject(t, sessionToken, teamId, "my-app");

    const now = Date.now();
    await t.mutation(internal.events.ingestBatch, {
      events: [
        { writeKey, name: "ai_completion", visitorId: "u1", sessionId: "s1", timestamp: now, props: { model: "claude-3-5-sonnet", tokens: 500 } },
      ],
    });

    const events = await t.query(api.events.listLatest, { sessionToken, writeKey });
    expect(events[0].props).toEqual({ model: "claude-3-5-sonnet", tokens: 500 });
  });
});

describe("rateLimit.check", () => {
  test("allows requests up to the limit", async () => {
    const t = convexTest(schema, modules);

    const r1 = await t.mutation(internal.rateLimit.check, { key: "test:key", limit: 3 });
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(2);

    const r2 = await t.mutation(internal.rateLimit.check, { key: "test:key", limit: 3 });
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(1);

    const r3 = await t.mutation(internal.rateLimit.check, { key: "test:key", limit: 3 });
    expect(r3.allowed).toBe(true);
    expect(r3.remaining).toBe(0);
  });

  test("blocks when limit is exceeded", async () => {
    const t = convexTest(schema, modules);

    for (let i = 0; i < 3; i++) {
      await t.mutation(internal.rateLimit.check, { key: "test:block", limit: 3 });
    }

    const over = await t.mutation(internal.rateLimit.check, { key: "test:block", limit: 3 });
    expect(over.allowed).toBe(false);
    expect(over.remaining).toBe(0);
  });

  test("count param reserves N slots atomically", async () => {
    const t = convexTest(schema, modules);

    const r1 = await t.mutation(internal.rateLimit.check, { key: "test:batch", limit: 10, count: 7 });
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(3);

    // Another batch of 5 should fail (only 3 remaining)
    const r2 = await t.mutation(internal.rateLimit.check, { key: "test:batch", limit: 10, count: 5 });
    expect(r2.allowed).toBe(false);
    expect(r2.remaining).toBe(3);
  });

  test("returns resetAt as a future timestamp", async () => {
    const t = convexTest(schema, modules);
    const before = Date.now();
    const result = await t.mutation(internal.rateLimit.check, { key: "test:reset", limit: 5 });
    expect(result.resetAt).toBeGreaterThan(before);
  });

  test("different keys are tracked independently", async () => {
    const t = convexTest(schema, modules);

    for (let i = 0; i < 3; i++) {
      await t.mutation(internal.rateLimit.check, { key: "test:a", limit: 3 });
    }

    const b = await t.mutation(internal.rateLimit.check, { key: "test:b", limit: 3 });
    expect(b.allowed).toBe(true);
  });
});

describe("events.stats", () => {
  test("counts total events and unique visitors", async () => {
    const t = convexTest(schema, modules);
    const { sessionToken, teamId } = await setupSession(t, "user1");
    const writeKey = await setupProject(t, sessionToken, teamId, "my-app");

    await ingestEvent(t, writeKey, { visitorId: "alice" });
    await ingestEvent(t, writeKey, { visitorId: "alice" }); // same visitor, 2nd event
    await ingestEvent(t, writeKey, { visitorId: "bob" });

    const stats = await t.query(api.events.stats, { sessionToken, writeKey });
    expect(stats.totalEvents).toBe(3);
    expect(stats.activeUsers).toBe(2); // alice + bob, not 3
  });

  test("auth boundary: returns zeroes for wrong team", async () => {
    const t = convexTest(schema, modules);
    const { sessionToken: token1, teamId: teamId1 } = await setupSession(t, "user1");
    const { sessionToken: token2 } = await setupSession(t, "user2");

    const writeKey = await setupProject(t, token1, teamId1, "my-app");
    await ingestEvent(t, writeKey, { visitorId: "alice" });

    const stats = await t.query(api.events.stats, {
      sessionToken: token2,
      writeKey,
    });
    expect(stats).toEqual({ totalEvents: 0, activeUsers: 0 });
  });

  test("returns zeroes with no events", async () => {
    const t = convexTest(schema, modules);
    const { sessionToken, teamId } = await setupSession(t, "user1");
    const writeKey = await setupProject(t, sessionToken, teamId, "my-app");

    const stats = await t.query(api.events.stats, { sessionToken, writeKey });
    expect(stats).toEqual({ totalEvents: 0, activeUsers: 0 });
  });
});
