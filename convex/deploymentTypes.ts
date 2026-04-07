import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

const DEPLOYMENT_TYPE_TO_ENV: Record<string, string> = {
  dev: "development",
  prod: "production",
  preview: "preview",
  custom: "production",
};

export const resolve = internalQuery({
  args: { deploymentName: v.string() },
  handler: async (ctx, args) => {
    const cached = await ctx.db
      .query("deploymentTypes")
      .withIndex("by_deploymentName", (q) =>
        q.eq("deploymentName", args.deploymentName),
      )
      .unique();
    if (!cached) return null;
    return DEPLOYMENT_TYPE_TO_ENV[cached.deploymentType] ?? "development";
  },
});

export const cache = internalMutation({
  args: {
    writeKey: v.string(),
    deploymentName: v.string(),
    deploymentType: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("deploymentTypes")
      .withIndex("by_deploymentName", (q) =>
        q.eq("deploymentName", args.deploymentName),
      )
      .unique();

    if (existing) {
      await ctx.db.patch("deploymentTypes", existing._id, {
        deploymentType: args.deploymentType,
      });
    } else {
      await ctx.db.insert("deploymentTypes", {
        writeKey: args.writeKey,
        deploymentName: args.deploymentName,
        deploymentType: args.deploymentType,
      });
    }
  },
});
