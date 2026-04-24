import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export default defineSchema({
  // -------------------------------------------------------------------------
  // Identity — managed by @convex-dev/auth
  //
  // authTables provides: users, authSessions, authAccounts, authRefreshTokens,
  // authVerifiers, authVerificationCodes, authRateLimits.
  //
  // `users` has fields: name, email, image, emailVerificationTime, phone,
  // phoneVerificationTime, isAnonymous. Identified by Id<"users">.
  // -------------------------------------------------------------------------
  // authTables.users already defines indexes on `email` and `phone`, so we
  // don't need to redefine them here. Redefining the `email` index triggers
  // "Table users has two or more definitions of index 'email'" on deploy.
  ...authTables,

  // -------------------------------------------------------------------------
  // Teams (unit of ownership and billing)
  // -------------------------------------------------------------------------

  // convexTeamId is populated when a team member connects Convex team-level
  // OAuth (for project provisioning). A team can exist without it.
  teams: defineTable({
    convexTeamId: v.optional(v.number()),
    name: v.string(),
    slug: v.string(),
    plan: v.union(v.literal("free"), v.literal("solo"), v.literal("pro")),
    stripeCustomerId: v.optional(v.string()),
    stripeSubscriptionId: v.optional(v.string()),
    usageLimitEventsPerMonth: v.number(),
    usageEventsThisMonth: v.optional(v.number()),
    usageMonthKey: v.optional(v.string()),
    notifiedAt80Pct: v.optional(v.boolean()),
    notifiedAt100Pct: v.optional(v.boolean()),
    createdAt: v.number(),
  })
    .index("by_convexTeamId", ["convexTeamId"])
    .index("by_slug", ["slug"]),

  // Links users to teams. A user can be on multiple teams.
  teamMembers: defineTable({
    teamId: v.id("teams"),
    userId: v.id("users"),
    role: v.union(v.literal("owner"), v.literal("admin"), v.literal("member")),
    joinedAt: v.number(),
  })
    .index("by_teamId", ["teamId"])
    .index("by_userId", ["userId"])
    .index("by_teamId_and_userId", ["teamId", "userId"]),

  // Pending team invitations. Invitee signs in with Google; server matches
  // the Google email against invitedEmail to finalize the join.
  teamInvites: defineTable({
    teamId: v.id("teams"),
    invitedEmail: v.string(),
    tokenHash: v.string(),
    role: v.union(v.literal("admin"), v.literal("member")),
    invitedBy: v.id("users"),
    expiresAt: v.number(), // invites expire after 7 days
    acceptedAt: v.optional(v.number()),
  })
    .index("by_tokenHash", ["tokenHash"])
    .index("by_teamId", ["teamId"])
    .index("by_teamId_and_email", ["teamId", "invitedEmail"]),

  // Convex team-OAuth grants. Separate from user identity — a team member
  // "Connects Convex" once to let the app provision projects via the
  // Convex Management API. Management tokens can expire (~1 hour); the
  // grant should be refreshed when that happens.
  teamConvexGrants: defineTable({
    teamId: v.id("teams"),
    grantedByUserId: v.id("users"),
    managementToken: v.string(),
    createdAt: v.number(),
  }).index("by_teamId", ["teamId"]),

  // -------------------------------------------------------------------------
  // Projects (analytics projects owned by teams)
  // -------------------------------------------------------------------------

  projects: defineTable({
    teamId: v.optional(v.id("teams")), // null until claimed by a human
    name: v.string(),
    writeKey: v.string(),
    convexProjectId: v.optional(v.string()),
    convexDeploymentSlug: v.optional(v.string()),
    siteUrl: v.optional(v.string()),
    claimToken: v.optional(v.string()),
    claimed: v.optional(v.boolean()),
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
  // browser. They are NOT related to the users/authSessions tables above
  // (which are for dashboard authentication).
  // -------------------------------------------------------------------------

  events: defineTable({
    writeKey: v.string(),
    name: v.string(),
    visitorId: v.string(),
    sessionId: v.string(),
    timestamp: v.number(),
    environment: v.optional(v.string()),
    userEmail: v.optional(v.string()),
    userName: v.optional(v.string()),
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
    visitorId: v.string(),
    sessionId: v.string(),
    timestamp: v.number(),
    environment: v.optional(v.string()),
    userEmail: v.optional(v.string()),
    userName: v.optional(v.string()),
    path: v.string(),
    referrer: v.string(),
    referrerHost: v.string(),
    title: v.string(),
    utm_source: v.optional(v.string()),
    utm_medium: v.optional(v.string()),
    utm_campaign: v.optional(v.string()),
    country: v.optional(v.string()),
    deviceType: v.optional(v.string()),
    browser: v.optional(v.string()),
    osName: v.optional(v.string()),
  })
    .index("by_writeKey_and_timestamp", ["writeKey", "timestamp"])
    .index("by_writeKey_and_environment_and_timestamp", [
      "writeKey",
      "environment",
      "timestamp",
    ])
    .index("by_writeKey_and_path", ["writeKey", "path"]),

  deploymentTypes: defineTable({
    writeKey: v.string(),
    deploymentName: v.string(),
    deploymentType: v.string(),
  })
    .index("by_deploymentName", ["deploymentName"])
    .index("by_writeKey", ["writeKey"]),

  provisionAbuse: defineTable({
    ip: v.string(),
    window: v.number(),
    count: v.number(),
  }).index("by_ip_and_window", ["ip", "window"]),

  rateLimits: defineTable({
    key: v.string(),
    window: v.number(),
    count: v.number(),
  }).index("by_key_and_window", ["key", "window"]),

  // -------------------------------------------------------------------------
  // Funnels — saved ordered-step conversion analyses over events + pageviews.
  //
  // First saved-analytics primitive in Convalytics. Creatable from the
  // dashboard or agents via the MCP server. `conversionWindowMs` is a
  // correctness requirement: without it a funnel is just event co-occurrence
  // over the query window (step i must happen within cw of step i-1).
  // `status` + `deletedAt` is a soft-delete — removing a funnel someone has
  // been tracking for weeks is unrecoverable, so delete_funnel from both
  // MCP and UI patches status instead of calling ctx.db.delete.
  // -------------------------------------------------------------------------
  funnels: defineTable({
    projectId: v.id("projects"),
    teamId: v.id("teams"),
    name: v.string(),
    description: v.optional(v.string()),
    steps: v.array(
      v.object({
        kind: v.union(v.literal("event"), v.literal("pageview")),
        // Event name for kind="event", pageview path for kind="pageview".
        match: v.string(),
        label: v.optional(v.string()),
      }),
    ),
    conversionWindowMs: v.optional(v.number()),
    status: v.optional(
      v.union(v.literal("active"), v.literal("deleted")),
    ),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
    deletedAt: v.optional(v.number()),
  })
    .index("by_projectId", ["projectId"])
    .index("by_teamId", ["teamId"]),

  // -------------------------------------------------------------------------
  // API tokens — user-generated credentials scoped to one project.
  //
  // First consumer is MCP (Convalytics MCP server gated to Solo+). Intentionally
  // generic — future consumers (REST read API, webhook signing) expand `scope`.
  // Plain token shown once at creation; only the sha-256 hash is stored. Same
  // reveal-once pattern as teamInvites.
  // -------------------------------------------------------------------------
  apiTokens: defineTable({
    tokenHash: v.string(),
    // Kept for backward compat with tokens created during the project-scoped
    // MCP v1. New tokens are team-scoped and omit this field. Nothing reads
    // it anymore — safe to drop in a future migration.
    projectId: v.optional(v.id("projects")),
    teamId: v.id("teams"),
    createdBy: v.id("users"),
    name: v.string(),
    scope: v.literal("read"),
    createdAt: v.number(),
    lastUsedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
  })
    .index("by_tokenHash", ["tokenHash"])
    .index("by_teamId", ["teamId"])
    .index("by_createdBy", ["createdBy"]),
});
