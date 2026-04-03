import { v } from "convex/values";
import { action, mutation, query, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
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

    const data = (await resp.json()) as {
      projects: Array<{ id: number; name: string; slug: string }>;
    };
    return (data.projects ?? []).map((p) => ({
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
      const team = await ctx.db.get(membership.teamId);
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
