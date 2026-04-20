import { v } from "convex/values";
import {
  action,
  mutation,
  query,
  internalQuery,
  internalMutation,
  internalAction,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { getUserId, requireAuth, getUserTeamIds } from "./authHelpers";
import { render } from "@react-email/render";
import { WelcomeEmail } from "./emails/WelcomeEmail";
import { FROM, REPLY_TO, resend } from "./emailConfig";
import type { Id } from "./_generated/dataModel";

export const create = mutation({
  args: { name: v.string(), teamId: v.id("teams") },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);

    // Verify user is a member of the team
    const membership = await ctx.db
      .query("teamMembers")
      .withIndex("by_teamId_and_userId", (q) =>
        q.eq("teamId", args.teamId).eq("userId", userId),
      )
      .unique();
    if (!membership) throw new Error("Not a member of this team");

    const writeKey = crypto.randomUUID();
    await ctx.db.insert("projects", {
      teamId: args.teamId,
      name: args.name,
      writeKey,
    });
    return writeKey;
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    if (!userId) return null;

    // Get all teams the user is a member of
    const teamIds = await getUserTeamIds(ctx, userId);
    if (teamIds.length === 0) return [];

    // Get projects for all teams
    const allProjects = [];
    for (const teamId of teamIds) {
      const projects = await ctx.db
        .query("projects")
        .withIndex("by_teamId", (q) => q.eq("teamId", teamId))
        .collect();
      allProjects.push(...projects);
    }
    return allProjects;
  },
});

/**
 * List Convex projects for a team the caller has "Connected Convex" on.
 *
 * Uses the team's stored management token from `teamConvexGrants`. The
 * caller must be a member of the team.
 */
export const listConvexProjects = action({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);

    const isMember: boolean = await ctx.runQuery(
      internal.projects.isTeamMemberInternal,
      {
        teamId: args.teamId,
        userId,
      },
    );
    if (!isMember) {
      throw new Error("Not a member of this team");
    }

    const grant: {
      managementToken: string;
      convexTeamId: number;
    } | null = await ctx.runQuery(internal.projects.getTeamGrantInternal, {
      teamId: args.teamId,
    });
    if (!grant) {
      throw new Error("Convex team not connected for this team");
    }

    const url = `https://api.convex.dev/v1/teams/${grant.convexTeamId}/list_projects`;
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${grant.managementToken}` },
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      throw new Error(
        `Failed to fetch Convex projects (${resp.status}): ${body}`,
      );
    }

    const projects = (await resp.json()) as Array<{
      id: number;
      name: string;
      slug: string;
    }>;

    // Filter out auto-generated project names and convalytics itself
    return projects
      .filter(
        (p) => p.slug !== "convalytics" && !p.name.match(/^m5[0-9a-z]{30,}/),
      )
      .map((p) => ({
        id: String(p.id),
        name: p.name,
        slug: p.slug,
      }));
  },
});

export const createFromConvex = mutation({
  args: {
    teamId: v.id("teams"),
    name: v.string(),
    convexProjectId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);

    // Verify user is a member of the team
    const membership = await ctx.db
      .query("teamMembers")
      .withIndex("by_teamId_and_userId", (q) =>
        q.eq("teamId", args.teamId).eq("userId", userId),
      )
      .unique();
    if (!membership) throw new Error("Not a member of this team");

    // Idempotent — return existing write key if already connected
    const existing = await ctx.db
      .query("projects")
      .withIndex("by_teamId_and_convexProjectId", (q) =>
        q.eq("teamId", args.teamId).eq("convexProjectId", args.convexProjectId),
      )
      .unique();
    if (existing) return existing.writeKey;

    const writeKey = crypto.randomUUID();
    await ctx.db.insert("projects", {
      teamId: args.teamId,
      name: args.name,
      writeKey,
      convexProjectId: args.convexProjectId,
    });
    return writeKey;
  },
});

export const validateWriteKey = internalQuery({
  args: { writeKey: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("projects")
      .withIndex("by_writeKey", (q) => q.eq("writeKey", args.writeKey))
      .unique();
  },
});

export const backfillSiteUrl = internalMutation({
  args: { projectId: v.id("projects"), siteUrl: v.string() },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project || project.siteUrl) return;
    await ctx.db.patch(args.projectId, { siteUrl: args.siteUrl });
  },
});

// Agent-first: create an unclaimed project without auth.
// Returns writeKey + claimToken. Human claims it later.
// Idempotent: if a project with the same convexDeploymentSlug already exists, returns it.
export const provision = internalMutation({
  args: {
    name: v.string(),
    convexDeploymentSlug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.convexDeploymentSlug) {
      const rows = await ctx.db
        .query("projects")
        .withIndex("by_convexDeploymentSlug", (q) =>
          q.eq("convexDeploymentSlug", args.convexDeploymentSlug),
        )
        .collect();
      if (rows.length > 0) {
        // Detect duplicates and reconcile deterministically
        if (rows.length > 1) {
          // Select canonical row by earliest createdAt (or _creationTime if no createdAt field)
          const canonical = rows.reduce((earliest, current) => {
            const earliestTime = earliest._creationTime;
            const currentTime = current._creationTime;
            return currentTime < earliestTime ? current : earliest;
          });
          // Generate and persist claimToken if missing
          let claimToken = canonical.claimToken;
          if (!claimToken) {
            claimToken = crypto.randomUUID();
            await ctx.db.patch("projects", canonical._id, { claimToken });
          }
          return {
            writeKey: canonical.writeKey,
            claimToken,
          };
        }
        const existing = rows[0];
        // Generate and persist claimToken if missing
        let claimToken = existing.claimToken;
        if (!claimToken) {
          claimToken = crypto.randomUUID();
          await ctx.db.patch("projects", existing._id, { claimToken });
        }
        return {
          writeKey: existing.writeKey,
          claimToken,
        };
      }
    }

    const writeKey = crypto.randomUUID();
    const claimToken = crypto.randomUUID();
    await ctx.db.insert("projects", {
      name: args.name,
      writeKey,
      claimToken,
      claimed: false,
      convexDeploymentSlug: args.convexDeploymentSlug,
    });
    return { writeKey, claimToken };
  },
});

/**
 * Claim an unclaimed project.
 *
 * Identity comes from Convex Auth (Google). If the user's first team has a
 * connected Convex team grant, we use that management token to resolve the
 * Convex deployment slug → project ID and cache deployment types.
 */
export const claim = action({
  args: { claimToken: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{ projectId: string; name: string; writeKey: string }> => {
    const userId = await requireAuth(ctx);

    const project: {
      convexDeploymentSlug?: string;
      claimed?: boolean;
      writeKey?: string;
    } | null = await ctx.runQuery(internal.projects.getByClaimTokenInternal, {
      claimToken: args.claimToken,
    });
    if (!project) throw new Error("Invalid or expired claim link");
    if (project.claimed)
      throw new Error("This project has already been claimed");

    // Resolve the user's team + optional Convex management grant
    const grant: {
      teamId: Id<"teams">;
      managementToken: string;
      convexTeamId: number;
    } | null = await ctx.runQuery(internal.projects.getUserPrimaryGrant, {
      userId,
    });

    // If we have a deployment slug AND a connected Convex grant, resolve the
    // deployment slug to a Management API project ID and cache deployment types
    // for environment tagging.
    let convexProjectId: string | undefined;
    if (project.convexDeploymentSlug && grant) {
      try {
        const listProjectsUrl = `https://api.convex.dev/v1/teams/${grant.convexTeamId}/list_projects`;
        const projectsResp = await fetch(listProjectsUrl, {
          headers: { Authorization: `Bearer ${grant.managementToken}` },
        });
        if (projectsResp.ok) {
          const apiProjects = (await projectsResp.json()) as Array<{
            id: number;
            name: string;
            slug: string;
          }>;

          // Walk each project's deployments looking for a name match.
          // Query in parallel; stop at the first match.
          const matches = await Promise.all(
            apiProjects.map(async (p) => {
              try {
                const depUrl = `https://api.convex.dev/v1/projects/${p.id}/list_deployments`;
                const depResp = await fetch(depUrl, {
                  headers: {
                    Authorization: `Bearer ${grant.managementToken}`,
                  },
                });
                if (!depResp.ok) return null;
                const deployments = (await depResp.json()) as Array<{
                  name: string;
                  deploymentType: string;
                }>;
                const hit = deployments.find(
                  (d) => d.name === project.convexDeploymentSlug,
                );
                return hit ? { project: p, deployments } : null;
              } catch {
                return null;
              }
            }),
          );

          const matched = matches.find((m) => m !== null);
          if (matched) {
            convexProjectId = String(matched.project.id);
            if (project.writeKey) {
              for (const d of matched.deployments) {
                if (d.name && d.deploymentType) {
                  await ctx.runMutation(internal.deploymentTypes.cache, {
                    writeKey: project.writeKey,
                    deploymentName: d.name,
                    deploymentType: d.deploymentType,
                  });
                }
              }
            }
          }
        }
      } catch {
        // Non-fatal — claim still works, just without the Management API link
      }
    }

    const result = await ctx.runMutation(internal.projects.finalizeClaim, {
      claimToken: args.claimToken,
      userId,
      convexProjectId,
    });

    // Fire welcome email non-blocking — failure should not break the claim flow
    try {
      await ctx.scheduler.runAfter(0, internal.projects.sendWelcomeEmail, {
        userId,
        projectName: result.name,
      });
    } catch {
      // Swallow scheduling errors to ensure claim succeeds
    }

    return result;
  },
});

// Internal mutation to finalize the claim after the action resolves the slug
export const finalizeClaim = internalMutation({
  args: {
    claimToken: v.string(),
    userId: v.id("users"),
    convexProjectId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db
      .query("projects")
      .withIndex("by_claimToken", (q) => q.eq("claimToken", args.claimToken))
      .unique();

    if (!project) throw new Error("Invalid or expired claim link");
    if (project.claimed)
      throw new Error("This project has already been claimed");

    const teamIds = await getUserTeamIds(ctx, args.userId);
    let teamId = teamIds[0];
    if (!teamId) {
      const now = Date.now();
      const user = await ctx.db.get("users", args.userId);
      const baseName = user?.name?.trim() || user?.email?.split("@")[0]?.trim();
      const teamName = baseName ? `${baseName}'s Team` : "My Team";
      teamId = await ctx.db.insert("teams", {
        name: teamName,
        slug: `team-${crypto.randomUUID()}`,
        plan: "free",
        usageLimitEventsPerMonth: 10000,
        createdAt: now,
      });
      await ctx.db.insert("teamMembers", {
        teamId,
        userId: args.userId,
        role: "owner",
        joinedAt: now,
      });
    }

    await ctx.db.patch("projects", project._id, {
      teamId,
      claimed: true,
      ...(args.convexProjectId
        ? { convexProjectId: args.convexProjectId }
        : {}),
    });

    return {
      projectId: project._id,
      name: project.name,
      writeKey: project.writeKey,
    };
  },
});

// Lookup project by claim token (for the claim page UI)
export const getByClaimToken = query({
  args: { claimToken: v.string() },
  handler: async (ctx, args) => {
    const project = await ctx.db
      .query("projects")
      .withIndex("by_claimToken", (q) => q.eq("claimToken", args.claimToken))
      .unique();
    if (!project) return null;
    return { name: project.name, claimed: project.claimed ?? false };
  },
});

export const getByClaimTokenInternal = internalQuery({
  args: { claimToken: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("projects")
      .withIndex("by_claimToken", (q) => q.eq("claimToken", args.claimToken))
      .unique();
  },
});

/**
 * Returns the Convex management grant + convexTeamId for a team, or null
 * if no grant or the team has no `convexTeamId` recorded.
 */
export const getTeamGrantInternal = internalQuery({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => {
    const team = await ctx.db.get("teams", args.teamId);
    if (!team || team.convexTeamId === undefined) return null;

    const grant = await ctx.db
      .query("teamConvexGrants")
      .withIndex("by_teamId", (q) => q.eq("teamId", args.teamId))
      .first();
    if (!grant) return null;
    return {
      managementToken: grant.managementToken,
      convexTeamId: team.convexTeamId,
    };
  },
});

export const isTeamMemberInternal = internalQuery({
  args: { teamId: v.id("teams"), userId: v.id("users") },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const membership = await ctx.db
      .query("teamMembers")
      .withIndex("by_teamId_and_userId", (q) =>
        q.eq("teamId", args.teamId).eq("userId", args.userId),
      )
      .unique();
    return membership !== null;
  },
});

/**
 * Finds the first team the user is a member of that has a Convex team grant.
 * Returns null if the user has no team or no team has a grant.
 */
export const getUserPrimaryGrant = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const teamIds = await getUserTeamIds(ctx, args.userId);
    for (const teamId of teamIds) {
      const team = await ctx.db.get("teams", teamId);
      if (!team || team.convexTeamId === undefined) continue;
      const grant = await ctx.db
        .query("teamConvexGrants")
        .withIndex("by_teamId", (q) => q.eq("teamId", teamId))
        .first();
      if (grant) {
        return {
          teamId,
          managementToken: grant.managementToken,
          convexTeamId: team.convexTeamId,
        };
      }
    }
    return null;
  },
});

// Get all teams the user is a member of
export const listTeams = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);

    const memberships = await ctx.db
      .query("teamMembers")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();

    const teams = [];
    for (const membership of memberships) {
      const team = await ctx.db.get("teams", membership.teamId);
      if (team) {
        teams.push({
          ...team,
          role: membership.role,
        });
      }
    }
    return teams;
  },
});

export const sendWelcomeEmail = internalAction({
  args: { userId: v.id("users"), projectName: v.string() },
  handler: async (ctx, args) => {
    try {
      const ownerEmail: string | null = await ctx.runQuery(
        internal.projects.getOwnerEmailByUser,
        { userId: args.userId },
      );
      if (!ownerEmail) return;

      const dashboardUrl = "https://convalytics.dev/overview";
      await resend.sendEmail(
        ctx,
        FROM,
        ownerEmail,
        `${args.projectName} is now tracking with Convalytics`,
        await render(
          WelcomeEmail({ projectName: args.projectName, dashboardUrl }),
        ),
        undefined,
        REPLY_TO,
      );
    } catch {
      // Non-fatal — don't break the claim flow
    }
  },
});

export const getOwnerEmailByUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get("users", args.userId);
    return user?.email ?? null;
  },
});

/**
 * List projects for a team that have a Convex deployment slug recorded.
 * Used by `resolveTeamDeployments` to figure out which projects need
 * Management API resolution.
 */
export const listTeamProjectsForResolution = internalQuery({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => {
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_teamId", (q) => q.eq("teamId", args.teamId))
      .collect();
    return projects
      .filter((p) => p.convexDeploymentSlug)
      .map((p) => ({
        _id: p._id,
        writeKey: p.writeKey,
        convexDeploymentSlug: p.convexDeploymentSlug as string,
        convexProjectId: p.convexProjectId,
      }));
  },
});

export const patchProjectConvexProjectId = internalMutation({
  args: {
    projectId: v.id("projects"),
    convexProjectId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch("projects", args.projectId, {
      convexProjectId: args.convexProjectId,
    });
  },
});

/**
 * Resolve every project owned by `teamId` against the Convex Management API:
 * look up each project's `convexDeploymentSlug` in the team's Convex projects,
 * cache its deployment types for env tagging, and save the resolved
 * `convexProjectId` back on the project row.
 *
 * Called from `oauth.exchangeCode` right after a team grant is created/refreshed.
 * Safe to run repeatedly — `deploymentTypes.cache` upserts and the project
 * patch is idempotent.
 */
export const resolveTeamDeployments = internalAction({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args): Promise<void> => {
    const grant: {
      managementToken: string;
      convexTeamId: number;
    } | null = await ctx.runQuery(internal.projects.getTeamGrantInternal, {
      teamId: args.teamId,
    });
    if (!grant) return;

    const projects: Array<{
      _id: Id<"projects">;
      writeKey: string;
      convexDeploymentSlug: string;
      convexProjectId?: string;
    }> = await ctx.runQuery(
      internal.projects.listTeamProjectsForResolution,
      { teamId: args.teamId },
    );
    if (projects.length === 0) return;

    const listProjectsUrl = `https://api.convex.dev/v1/teams/${grant.convexTeamId}/list_projects`;
    const projectsResp = await fetch(listProjectsUrl, {
      headers: { Authorization: `Bearer ${grant.managementToken}` },
    });
    if (!projectsResp.ok) return;

    const apiProjects = (await projectsResp.json()) as Array<{
      id: number;
      name: string;
      slug: string;
    }>;

    // Fetch deployments for every Convex project once, in parallel.
    const deploymentsByConvexProjectId = new Map<
      number,
      Array<{ name: string; deploymentType: string }>
    >();
    await Promise.all(
      apiProjects.map(async (p) => {
        try {
          const depUrl = `https://api.convex.dev/v1/projects/${p.id}/list_deployments`;
          const depResp = await fetch(depUrl, {
            headers: { Authorization: `Bearer ${grant.managementToken}` },
          });
          if (!depResp.ok) return;
          const deployments = (await depResp.json()) as Array<{
            name: string;
            deploymentType: string;
          }>;
          deploymentsByConvexProjectId.set(p.id, deployments);
        } catch {
          // Skip this project — non-fatal
        }
      }),
    );

    // For each of our projects, find the matching Convex project by slug
    // and cache deployment types + patch the convexProjectId.
    for (const project of projects) {
      let matchedConvexProjectId: number | undefined;
      let matchedDeployments:
        | Array<{ name: string; deploymentType: string }>
        | undefined;
      for (const [convexProjectId, deployments] of deploymentsByConvexProjectId) {
        if (deployments.some((d) => d.name === project.convexDeploymentSlug)) {
          matchedConvexProjectId = convexProjectId;
          matchedDeployments = deployments;
          break;
        }
      }
      if (!matchedConvexProjectId || !matchedDeployments) continue;

      for (const d of matchedDeployments) {
        if (d.name && d.deploymentType) {
          await ctx.runMutation(internal.deploymentTypes.cache, {
            writeKey: project.writeKey,
            deploymentName: d.name,
            deploymentType: d.deploymentType,
          });
        }
      }

      const resolvedId = String(matchedConvexProjectId);
      if (project.convexProjectId !== resolvedId) {
        await ctx.runMutation(internal.projects.patchProjectConvexProjectId, {
          projectId: project._id,
          convexProjectId: resolvedId,
        });
      }
    }
  },
});
