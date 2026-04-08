/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test, beforeEach } from "vitest";
import { internal } from "./_generated/api";
import { api } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import schema from "./schema";
import { PLANS } from "./plans";

const modules = import.meta.glob("./**/*.ts");

// ─── Shared helpers ───────────────────────────────────────────────────────────

async function setupTeamWithProject(
  t: ReturnType<typeof convexTest>,
  plan: "free" | "solo" | "pro" = "free",
  limitOverride?: number,
) {
  let teamId!: Id<"teams">;
  let writeKey!: string;

  await t.run(async (ctx) => {
    const userId = "user1";
    await ctx.db.insert("users", { userId, createdAt: Date.now() });

    teamId = await ctx.db.insert("teams", {
      convexTeamId: 1,
      name: "Test Team",
      slug: "test-team",
      plan,
      usageLimitEventsPerMonth: limitOverride ?? PLANS[plan].eventsPerMonth,
      createdAt: Date.now(),
    });

    await ctx.db.insert("teamMembers", {
      teamId,
      userId,
      role: "owner",
      joinedAt: Date.now(),
    });

    writeKey = "wk_test_" + Math.random().toString(36).slice(2);
    await ctx.db.insert("projects", {
      teamId,
      name: "Test Project",
      writeKey,
      claimed: true,
    });
  });

  return { teamId, writeKey };
}

// ─── usage.checkAndIncrement ──────────────────────────────────────────────────

describe("usage.checkAndIncrement", () => {
  test("allows events under the quota", async () => {
    const t = convexTest(schema, modules);
    const { writeKey } = await setupTeamWithProject(t, "free");

    const result = await t.mutation(internal.usage.checkAndIncrement, {
      writeKey,
      count: 1,
    });

    expect(result.allowed).toBe(true);
    expect(result.usageAfter).toBe(1);
    expect(result.limit).toBe(PLANS.free.eventsPerMonth);
  });

  test("accumulates usage across multiple calls", async () => {
    const t = convexTest(schema, modules);
    const { writeKey } = await setupTeamWithProject(t, "free");

    await t.mutation(internal.usage.checkAndIncrement, { writeKey, count: 100 });
    const result = await t.mutation(internal.usage.checkAndIncrement, {
      writeKey,
      count: 50,
    });

    expect(result.allowed).toBe(true);
    expect(result.usageAfter).toBe(150);
  });

  test("blocks events when quota is exceeded", async () => {
    const t = convexTest(schema, modules);
    // Set limit to 10 for easy testing
    const { writeKey } = await setupTeamWithProject(t, "free", 10);

    await t.mutation(internal.usage.checkAndIncrement, { writeKey, count: 10 });

    const result = await t.mutation(internal.usage.checkAndIncrement, {
      writeKey,
      count: 1,
    });

    expect(result.allowed).toBe(false);
    expect(result.usageAfter).toBe(10);
  });

  test("blocks batch that would exceed remaining quota", async () => {
    const t = convexTest(schema, modules);
    const { writeKey } = await setupTeamWithProject(t, "free", 10);

    await t.mutation(internal.usage.checkAndIncrement, { writeKey, count: 8 });

    // Batch of 5 would push to 13, over limit of 10
    const result = await t.mutation(internal.usage.checkAndIncrement, {
      writeKey,
      count: 5,
    });

    expect(result.allowed).toBe(false);
  });

  test("returns correct plan and limit for solo tier", async () => {
    const t = convexTest(schema, modules);
    const { writeKey } = await setupTeamWithProject(t, "solo");

    const result = await t.mutation(internal.usage.checkAndIncrement, {
      writeKey,
      count: 1,
    });

    expect(result.plan).toBe("solo");
    expect(result.limit).toBe(PLANS.solo.eventsPerMonth);
  });

  test("returns null teamId for unclaimed project (always allows)", async () => {
    const t = convexTest(schema, modules);
    let writeKey!: string;
    await t.run(async (ctx) => {
      writeKey = "wk_unclaimed_" + Math.random().toString(36).slice(2);
      await ctx.db.insert("projects", {
        name: "Unclaimed",
        writeKey,
        claimed: false,
        claimToken: "tok_test",
      });
    });

    const result = await t.mutation(internal.usage.checkAndIncrement, {
      writeKey,
      count: 1,
    });

    expect(result.allowed).toBe(true);
    expect(result.teamId).toBeNull();
  });

  test("resets usage on new month", async () => {
    const t = convexTest(schema, modules);
    const { writeKey, teamId } = await setupTeamWithProject(t, "free", 10);

    // Simulate previous month usage at limit
    await t.run(async (ctx) => {
      await ctx.db.patch("teams", teamId, {
        usageEventsThisMonth: 10,
        usageMonthKey: "2020-01", // old month
        notifiedAt80Pct: true,
        notifiedAt100Pct: true,
      });
    });

    const result = await t.mutation(internal.usage.checkAndIncrement, {
      writeKey,
      count: 1,
    });

    expect(result.allowed).toBe(true);
    expect(result.usageAfter).toBe(1);

    // Notification flags should reset
    const team = await t.run(async (ctx) => ctx.db.get("teams", teamId));
    expect(team?.notifiedAt80Pct).toBe(false);
    expect(team?.notifiedAt100Pct).toBe(false);
  });
});

// ─── usage.checkProvisionAbuse ────────────────────────────────────────────────

describe("usage.checkProvisionAbuse", () => {
  test("allows provisioning under the limit", async () => {
    const t = convexTest(schema, modules);

    const r1 = await t.mutation(internal.usage.checkProvisionAbuse, {
      ip: "1.2.3.4",
      limit: 5,
    });
    expect(r1).toBe(true);
  });

  test("blocks provisioning over the limit", async () => {
    const t = convexTest(schema, modules);

    for (let i = 0; i < 5; i++) {
      await t.mutation(internal.usage.checkProvisionAbuse, { ip: "1.2.3.4", limit: 5 });
    }

    const over = await t.mutation(internal.usage.checkProvisionAbuse, {
      ip: "1.2.3.4",
      limit: 5,
    });
    expect(over).toBe(false);
  });

  test("different IPs tracked independently", async () => {
    const t = convexTest(schema, modules);

    for (let i = 0; i < 5; i++) {
      await t.mutation(internal.usage.checkProvisionAbuse, { ip: "1.2.3.4", limit: 5 });
    }

    const other = await t.mutation(internal.usage.checkProvisionAbuse, {
      ip: "5.6.7.8",
      limit: 5,
    });
    expect(other).toBe(true);
  });
});

// ─── billing.applySubscription ────────────────────────────────────────────────

describe("billing.applySubscription", () => {
  test("upgrades team to solo plan with correct limits", async () => {
    const t = convexTest(schema, modules);
    const { teamId } = await setupTeamWithProject(t, "free");

    await t.mutation(internal.billing.applySubscription, {
      teamId,
      plan: "solo",
      stripeSubscriptionId: "sub_test_123",
    });

    const team = await t.run(async (ctx) => ctx.db.get("teams", teamId));
    expect(team?.plan).toBe("solo");
    expect(team?.usageLimitEventsPerMonth).toBe(PLANS.solo.eventsPerMonth);
    expect(team?.stripeSubscriptionId).toBe("sub_test_123");
  });

  test("upgrades team to pro plan with correct limits", async () => {
    const t = convexTest(schema, modules);
    const { teamId } = await setupTeamWithProject(t, "free");

    await t.mutation(internal.billing.applySubscription, {
      teamId,
      plan: "pro",
      stripeSubscriptionId: "sub_pro_456",
    });

    const team = await t.run(async (ctx) => ctx.db.get("teams", teamId));
    expect(team?.plan).toBe("pro");
    expect(team?.usageLimitEventsPerMonth).toBe(PLANS.pro.eventsPerMonth);
  });

  test("downgrades to free and clears subscription ID", async () => {
    const t = convexTest(schema, modules);
    const { teamId } = await setupTeamWithProject(t, "solo");

    await t.run(async (ctx) => {
      await ctx.db.patch("teams", teamId, {
        stripeSubscriptionId: "sub_existing_123",
      });
    });

    await t.mutation(internal.billing.applySubscription, {
      teamId,
      plan: "free",
    });

    const team = await t.run(async (ctx) => ctx.db.get("teams", teamId));
    expect(team?.plan).toBe("free");
    expect(team?.usageLimitEventsPerMonth).toBe(PLANS.free.eventsPerMonth);
    expect(team?.stripeSubscriptionId).toBeUndefined();
  });

  test("resets notification flags on plan change", async () => {
    const t = convexTest(schema, modules);
    const { teamId } = await setupTeamWithProject(t, "free");

    await t.run(async (ctx) => {
      await ctx.db.patch("teams", teamId, {
        notifiedAt80Pct: true,
        notifiedAt100Pct: true,
      });
    });

    await t.mutation(internal.billing.applySubscription, {
      teamId,
      plan: "solo",
      stripeSubscriptionId: "sub_new",
    });

    const team = await t.run(async (ctx) => ctx.db.get("teams", teamId));
    expect(team?.notifiedAt80Pct).toBe(false);
    expect(team?.notifiedAt100Pct).toBe(false);
  });
});

// ─── notifications.markNotified / getTeamOwnerEmailQuery ─────────────────────

describe("notifications", () => {
  test("markNotified sets 80% flag", async () => {
    const t = convexTest(schema, modules);
    const { teamId } = await setupTeamWithProject(t, "free");

    await t.mutation(internal.notifications.markNotified, {
      teamId,
      threshold: "80",
    });

    const team = await t.run(async (ctx) => ctx.db.get("teams", teamId));
    expect(team?.notifiedAt80Pct).toBe(true);
    expect(team?.notifiedAt100Pct).toBeFalsy();
  });

  test("markNotified sets 100% flag", async () => {
    const t = convexTest(schema, modules);
    const { teamId } = await setupTeamWithProject(t, "free");

    await t.mutation(internal.notifications.markNotified, {
      teamId,
      threshold: "100",
    });

    const team = await t.run(async (ctx) => ctx.db.get("teams", teamId));
    expect(team?.notifiedAt100Pct).toBe(true);
    expect(team?.notifiedAt80Pct).toBeFalsy();
  });

  test("getTeamOwnerEmailQuery returns owner email", async () => {
    const t = convexTest(schema, modules);
    let teamId!: Id<"teams">;

    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        userId: "owner1",
        email: "owner@example.com",
        createdAt: Date.now(),
      });
      teamId = await ctx.db.insert("teams", {
        convexTeamId: 99,
        name: "Team",
        slug: "team",
        plan: "free",
        usageLimitEventsPerMonth: 50000,
        createdAt: Date.now(),
      });
      await ctx.db.insert("teamMembers", {
        teamId,
        userId: "owner1",
        role: "owner",
        joinedAt: Date.now(),
      });
    });

    const { ownerEmail } = await t.query(
      internal.notifications.getTeamOwnerEmailQuery,
      { teamId },
    );
    expect(ownerEmail).toBe("owner@example.com");
  });

  test("getTeamOwnerEmailQuery returns null when owner has no email", async () => {
    const t = convexTest(schema, modules);
    let teamId!: Id<"teams">;

    await t.run(async (ctx) => {
      await ctx.db.insert("users", { userId: "owner2", createdAt: Date.now() }); // no email
      teamId = await ctx.db.insert("teams", {
        convexTeamId: 100,
        name: "Team2",
        slug: "team2",
        plan: "free",
        usageLimitEventsPerMonth: 50000,
        createdAt: Date.now(),
      });
      await ctx.db.insert("teamMembers", {
        teamId,
        userId: "owner2",
        role: "owner",
        joinedAt: Date.now(),
      });
    });

    const { ownerEmail } = await t.query(
      internal.notifications.getTeamOwnerEmailQuery,
      { teamId },
    );
    expect(ownerEmail).toBeNull();
  });
});

// ─── retention.pruneEvents ────────────────────────────────────────────────────

describe("retention.pruneEvents", () => {
  test("deletes events older than retention window", async () => {
    const t = convexTest(schema, modules);
    const { writeKey, teamId } = await setupTeamWithProject(t, "free");
    const sessionToken = "test-session";

    await t.run(async (ctx) => {
      await ctx.db.insert("sessions", {
        sessionToken,
        userId: "user1",
        managementToken: "tok",
        expiresAt: Date.now() + 999999,
      });
    });

    const now = Date.now();
    const oldTimestamp = now - 40 * 24 * 60 * 60 * 1000; // 40 days ago (beyond 30d free retention)
    const newTimestamp = now - 1 * 24 * 60 * 60 * 1000;  // 1 day ago (within retention)

    await t.mutation(internal.events.ingest, {
      writeKey, name: "old_event", visitorId: "v1", sessionId: "s1",
      timestamp: oldTimestamp, props: {},
    });
    await t.mutation(internal.events.ingest, {
      writeKey, name: "new_event", visitorId: "v1", sessionId: "s1",
      timestamp: newTimestamp, props: {},
    });

    await t.mutation(internal.retention.pruneEvents, {
      writeKey,
      retentionDays: 30,
      table: "events",
    });

    const remaining = await t.query(api.events.listLatest, {
      sessionToken,
      writeKey,
    });
    expect(remaining).toHaveLength(1);
    expect(remaining[0].name).toBe("new_event");
  });

  test("deletes nothing when all events are within retention window", async () => {
    const t = convexTest(schema, modules);
    const { writeKey, teamId } = await setupTeamWithProject(t, "free");
    const sessionToken = "test-session2";

    await t.run(async (ctx) => {
      await ctx.db.insert("sessions", {
        sessionToken,
        userId: "user1",
        managementToken: "tok",
        expiresAt: Date.now() + 999999,
      });
    });

    const now = Date.now();
    await t.mutation(internal.events.ingest, {
      writeKey, name: "recent", visitorId: "v1", sessionId: "s1",
      timestamp: now - 5 * 24 * 60 * 60 * 1000, props: {},
    });

    await t.mutation(internal.retention.pruneEvents, {
      writeKey,
      retentionDays: 30,
      table: "events",
    });

    const remaining = await t.query(api.events.listLatest, {
      sessionToken,
      writeKey,
    });
    expect(remaining).toHaveLength(1);
  });

  test("prunes pageviews table independently", async () => {
    const t = convexTest(schema, modules);
    const { writeKey } = await setupTeamWithProject(t, "free");
    const now = Date.now();

    await t.mutation(internal.pageviews.ingest, {
      writeKey, visitorId: "v1", sessionId: "s1",
      timestamp: now - 40 * 24 * 60 * 60 * 1000,
      path: "/old", referrer: "", title: "",
    });
    await t.mutation(internal.pageviews.ingest, {
      writeKey, visitorId: "v1", sessionId: "s1",
      timestamp: now - 1 * 24 * 60 * 60 * 1000,
      path: "/new", referrer: "", title: "",
    });

    await t.mutation(internal.retention.pruneEvents, {
      writeKey,
      retentionDays: 30,
      table: "pageviews",
    });

    const rows = await t.run(async (ctx) =>
      ctx.db.query("pageviews")
        .withIndex("by_writeKey_and_timestamp", (q) => q.eq("writeKey", writeKey))
        .collect()
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].path).toBe("/new");
  });
});
