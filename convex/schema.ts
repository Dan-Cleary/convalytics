import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // -------------------------------------------------------------------------
  // Teams & Users (multi-tenant SaaS model)
  // -------------------------------------------------------------------------

  // Teams are the unit of ownership and billing. Users auto-join a team based
  // on their Convex OAuth team. Future: invite flow for non-Convex users.
  teams: defineTable({
    convexTeamId: v.number(), // from Convex OAuth
    name: v.string(),
    slug: v.string(), // URL-friendly identifier
    // Billing (future)
    plan: v.union(v.literal("free"), v.literal("pro"), v.literal("enterprise")),
    stripeCustomerId: v.optional(v.string()),
    stripeSubscriptionId: v.optional(v.string()),
    usageLimitEventsPerMonth: v.number(),
    createdAt: v.number(),
  })
    .index("by_convexTeamId", ["convexTeamId"])
    .index("by_slug", ["slug"]),

  // Links users to teams. A user can be on multiple teams (future).
  teamMembers: defineTable({
    teamId: v.id("teams"),
    userId: v.string(), // ref: users.userId
    role: v.union(v.literal("owner"), v.literal("admin"), v.literal("member")),
    joinedAt: v.number(),
  })
    .index("by_teamId", ["teamId"])
    .index("by_userId", ["userId"])
    .index("by_teamId_and_userId", ["teamId", "userId"]),

  // Individual users. Created on first login via Convex OAuth.
  // Future: also created via invite flow (Convex Auth with email/password).
  users: defineTable({
    userId: v.string(), // stable ID: "convex:{teamId}" for OAuth users
    email: v.optional(v.string()), // future: for invited users
    name: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_userId", ["userId"]),

  // Ephemeral auth tokens. Rotated on each login, expire after 30 days.
  // managementToken is the Convex OAuth access token — used to call
  // api.convex.dev on behalf of the user. Expires independently (~1 hour).
  sessions: defineTable({
    sessionToken: v.string(),
    userId: v.string(), // ref: users.userId
    managementToken: v.string(),
    expiresAt: v.optional(v.number()), // epoch ms — optional for migration
  })
    .index("by_sessionToken", ["sessionToken"])
    .index("by_userId", ["userId"])
    .index("by_expiresAt", ["expiresAt"]),

  // -------------------------------------------------------------------------
  // Projects (analytics projects owned by teams)
  // -------------------------------------------------------------------------

  projects: defineTable({
    teamId: v.optional(v.id("teams")), // null until claimed by a human
    name: v.string(),
    writeKey: v.string(), // secret key sent with each event
    convexProjectId: v.optional(v.string()), // Convex Management API project id (set at claim)
    convexDeploymentSlug: v.optional(v.string()), // e.g. "peaceful-bobcat-731" — set by CLI at provision
    claimToken: v.optional(v.string()), // one-time token for claiming unclaimed projects
    claimed: v.optional(v.boolean()), // false/undefined = unclaimed, true = claimed
  })
    .index("by_teamId", ["teamId"])
    .index("by_writeKey", ["writeKey"])
    .index("by_teamId_and_convexProjectId", ["teamId", "convexProjectId"])
    .index("by_claimToken", ["claimToken"])
    .index("by_convexDeploymentSlug", ["convexDeploymentSlug"]),

  // -------------------------------------------------------------------------
  // Analytics data (collected from end-user websites)
  //
  // NOTE: visitorId and sessionId are anonymous identifiers generated in the
  // browser. They are NOT related to users/sessions tables above (which are
  // for dashboard authentication).
  // -------------------------------------------------------------------------

  events: defineTable({
    writeKey: v.string(),
    name: v.string(),
    visitorId: v.string(), // anonymous browser-generated UUID, or identified user ID
    sessionId: v.string(), // browser session UUID
    timestamp: v.number(),
    environment: v.optional(v.string()), // "development" | "production" | "preview"
    userEmail: v.optional(v.string()), // human-readable email from identify() or server-side track()
    userName: v.optional(v.string()), // human-readable name from identify() or server-side track()
    props: v.record(v.string(), v.union(v.string(), v.number(), v.boolean())),
  })
    .index("by_writeKey_and_timestamp", ["writeKey", "timestamp"])
    .index("by_writeKey_and_environment_and_timestamp", [
      "writeKey",
      "environment",
      "timestamp",
    ]),

  pageviews: defineTable({
    writeKey: v.string(),
    visitorId: v.string(), // anonymous browser-generated UUID, or identified user ID
    sessionId: v.string(), // browser session UUID
    timestamp: v.number(),
    environment: v.optional(v.string()), // "development" | "production" | "preview"
    userEmail: v.optional(v.string()),
    userName: v.optional(v.string()),
    path: v.string(),
    referrer: v.string(),
    referrerHost: v.string(),
    title: v.string(),
    utm_source: v.optional(v.string()),
    utm_medium: v.optional(v.string()),
    utm_campaign: v.optional(v.string()),
  })
    .index("by_writeKey_and_timestamp", ["writeKey", "timestamp"])
    .index("by_writeKey_and_environment_and_timestamp", [
      "writeKey",
      "environment",
      "timestamp",
    ])
    .index("by_writeKey_and_path", ["writeKey", "path"]),

  // Cache: maps Convex deployment names to their type (dev/prod/preview).
  // Populated during project claim via the Management API.
  deploymentTypes: defineTable({
    writeKey: v.string(),
    deploymentName: v.string(), // e.g. "happy-panda-123"
    deploymentType: v.string(), // "dev" | "prod" | "preview" | "custom"
  })
    .index("by_deploymentName", ["deploymentName"])
    .index("by_writeKey", ["writeKey"]),

  // -------------------------------------------------------------------------
  // Rate limiting (simple fixed-window counters)
  // -------------------------------------------------------------------------

  rateLimits: defineTable({
    key: v.string(),
    window: v.number(),
    count: v.number(),
  }).index("by_key_and_window", ["key", "window"]),
});
