import { v } from "convex/values";
import { action, mutation, query, internalQuery, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import { validateSession, getUserTeamIds } from "./authHelpers";

export const create = mutation({
  args: { sessionToken: v.string(), name: v.string(), teamId: v.id("teams") },
  handler: async (ctx, args) => {
    const session = await validateSession(ctx, args.sessionToken);
    if (!session) throw new Error("Not authenticated");

    // Verify user is a member of the team
    const membership = await ctx.db
      .query("teamMembers")
      .withIndex("by_teamId_and_userId", (q) =>
        q.eq("teamId", args.teamId).eq("userId", session.userId),
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
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const session = await validateSession(ctx, args.sessionToken);
    if (!session) return [];

    // Get all teams the user is a member of
    const teamIds = await getUserTeamIds(ctx, session.userId);
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

export const listConvexProjects = action({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.runQuery(internal.oauth.getSessionByToken, {
      sessionToken: args.sessionToken,
    });
    if (!session) throw new Error("Not authenticated");

    const convexTeamId = session.userId.split(":")[1];
    if (!convexTeamId || convexTeamId === "undefined") {
      throw new Error("Session is invalid — please sign out and sign back in.");
    }

    const url = `https://api.convex.dev/v1/teams/${convexTeamId}/list_projects`;
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${session.managementToken}` },
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      throw new Error(`Failed to fetch Convex projects (${resp.status}): ${body}`);
    }

    const projects = (await resp.json()) as Array<{
      id: number;
      name: string;
      slug: string;
    }>;

    // Filter out auto-generated project names and convalytics itself
    return projects
      .filter((p) => p.slug !== "convalytics" && !p.name.match(/^m5[0-9a-z]{30,}/))
      .map((p) => ({
        id: String(p.id),
        name: p.name,
        slug: p.slug,
      }));
  },
});

export const createFromConvex = mutation({
  args: {
    sessionToken: v.string(),
    teamId: v.id("teams"),
    name: v.string(),
    convexProjectId: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await validateSession(ctx, args.sessionToken);
    if (!session) throw new Error("Not authenticated");

    // Verify user is a member of the team
    const membership = await ctx.db
      .query("teamMembers")
      .withIndex("by_teamId_and_userId", (q) =>
        q.eq("teamId", args.teamId).eq("userId", session.userId),
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
          return { writeKey: canonical.writeKey, claimToken: canonical.claimToken ?? "" };
        }
        const existing = rows[0];
        return { writeKey: existing.writeKey, claimToken: existing.claimToken ?? "" };
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

async function cacheDeploymentTypes(
  ctx: ActionCtx,
  projectId: number,
  managementToken: string,
  writeKey: string,
) {
  try {
    const url = `https://api.convex.dev/v1/projects/${projectId}/list_deployments`;
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${managementToken}` },
    });
    if (!resp.ok) return;

    const deployments = (await resp.json()) as Array<{
      name: string;
      deploymentType: string;
    }>;

    for (const d of deployments) {
      if (d.name && d.deploymentType) {
        await ctx.runMutation(internal.deploymentTypes.cache, {
          writeKey,
          deploymentName: d.name,
          deploymentType: d.deploymentType,
        });
      }
    }
  } catch {
    // Non-fatal
  }
}

// Claim an unclaimed project: resolve deployment slug via Management API, then finalize.
export const claim = action({
  args: { sessionToken: v.string(), claimToken: v.string() },
  handler: async (ctx, args): Promise<{ projectId: string; name: string; writeKey: string }> => {
    const session = await ctx.runQuery(internal.oauth.getSessionByToken, {
      sessionToken: args.sessionToken,
    });
    if (!session) throw new Error("Not authenticated");

    const project: {
      convexDeploymentSlug?: string;
      claimed?: boolean;
      writeKey?: string;
    } | null = await ctx.runQuery(internal.projects.getByClaimTokenInternal, {
      claimToken: args.claimToken,
    });
    if (!project) throw new Error("Invalid or expired claim link");
    if (project.claimed) throw new Error("This project has already been claimed");

    // If we have a deployment slug, resolve it to a Management API project ID
    // and cache all deployment types for environment tagging.
    let convexProjectId: string | undefined;
    const convexTeamId = session.userId.split(":")[1];
    if (project.convexDeploymentSlug && convexTeamId && convexTeamId !== "undefined") {
      try {
        const url = `https://api.convex.dev/v1/teams/${convexTeamId}/list_projects`;
        const resp = await fetch(url, {
          headers: { Authorization: `Bearer ${session.managementToken}` },
        });
        if (resp.ok) {
          const apiProjects = (await resp.json()) as Array<{
            id: number;
            name: string;
            slug: string;
          }>;
          const matched = apiProjects.find(
            (p) => p.slug === project.convexDeploymentSlug,
          );
          if (matched) {
            convexProjectId = String(matched.id);
            if (project.writeKey) {
              await cacheDeploymentTypes(
                ctx,
                matched.id,
                session.managementToken,
                project.writeKey,
              );
            }
          }
        }
      } catch {
        // Non-fatal — claim still works, just without the Management API link
      }
    }

    return await ctx.runMutation(internal.projects.finalizeClaim, {
      claimToken: args.claimToken,
      sessionToken: args.sessionToken,
      convexProjectId,
    });
  },
});

// Internal mutation to finalize the claim after the action resolves the slug
export const finalizeClaim = internalMutation({
  args: {
    claimToken: v.string(),
    sessionToken: v.string(),
    convexProjectId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const session = await validateSession(ctx, args.sessionToken);
    if (!session) throw new Error("Not authenticated");

    const project = await ctx.db
      .query("projects")
      .withIndex("by_claimToken", (q) => q.eq("claimToken", args.claimToken))
      .unique();

    if (!project) throw new Error("Invalid or expired claim link");
    if (project.claimed) throw new Error("This project has already been claimed");

    const teamIds = await getUserTeamIds(ctx, session.userId);
    if (teamIds.length === 0) throw new Error("No team found — sign in first");

    const teamId = teamIds[0];
    await ctx.db.patch("projects", project._id, {
      teamId,
      claimed: true,
      ...(args.convexProjectId ? { convexProjectId: args.convexProjectId } : {}),
    });

    return { projectId: project._id, name: project.name, writeKey: project.writeKey };
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

// Get all teams the user is a member of
export const listTeams = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const session = await validateSession(ctx, args.sessionToken);
    if (!session) return [];

    const memberships = await ctx.db
      .query("teamMembers")
      .withIndex("by_userId", (q) => q.eq("userId", session.userId))
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