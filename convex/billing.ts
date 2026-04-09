import { v } from "convex/values";
import { action, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { StripeSubscriptions, registerRoutes } from "@convex-dev/stripe";
import { components } from "./_generated/api";
import { httpRouter } from "convex/server";
import { PLANS, type PlanId } from "./plans";
import { Id } from "./_generated/dataModel";

export const stripe = new StripeSubscriptions(components.stripe);

// Stripe price IDs — set these to your actual Stripe price IDs via env vars.
// These are read at runtime so they can be set in the Convex dashboard.
function getPriceId(plan: "solo" | "pro"): string {
  const key =
    plan === "solo" ? "STRIPE_PRICE_SOLO" : "STRIPE_PRICE_PRO";
  const id = process.env[key];
  if (!id) throw new Error(`Missing env var: ${key}`);
  return id;
}

// Create a Stripe Checkout session for a plan upgrade.
export const createCheckoutSession = action({
  args: {
    sessionToken: v.string(),
    plan: v.union(v.literal("solo"), v.literal("pro")),
    successUrl: v.string(),
    cancelUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.runQuery(internal.oauth.getSessionByToken, {
      sessionToken: args.sessionToken,
    });
    if (!session) throw new Error("Not authenticated");

    const teams = await ctx.runQuery(internal.billing.getTeamsForUser, {
      userId: session.userId,
    });
    if (teams.length === 0) throw new Error("No team found");
    const team = teams[0];

    const { customerId } = await stripe.getOrCreateCustomer(ctx, {
      userId: team._id,
      email: undefined,
    });

    // Persist Stripe customer ID if new
    if (!team.stripeCustomerId) {
      await ctx.runMutation(internal.billing.setStripeCustomerId, {
        teamId: team._id,
        stripeCustomerId: customerId,
      });
    }

    const { url } = await stripe.createCheckoutSession(ctx, {
      priceId: getPriceId(args.plan),
      customerId,
      mode: "subscription",
      successUrl: args.successUrl,
      cancelUrl: args.cancelUrl,
      subscriptionMetadata: { teamId: team._id },
    });

    return { url };
  },
});

// Create a billing portal session for managing subscriptions.
export const createPortalSession = action({
  args: {
    sessionToken: v.string(),
    returnUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.runQuery(internal.oauth.getSessionByToken, {
      sessionToken: args.sessionToken,
    });
    if (!session) throw new Error("Not authenticated");

    const teams = await ctx.runQuery(internal.billing.getTeamsForUser, {
      userId: session.userId,
    });
    if (teams.length === 0) throw new Error("No team found");
    const team = teams[0];
    if (!team.stripeCustomerId) throw new Error("No billing account found");

    const { url } = await stripe.createCustomerPortalSession(ctx, {
      customerId: team.stripeCustomerId,
      returnUrl: args.returnUrl,
    });

    return { url };
  },
});

// Internal helpers

export const getTeamsForUser = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const memberships = await ctx.db
      .query("teamMembers")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();

    const teams = [];
    for (const m of memberships) {
      const team = await ctx.db.get("teams", m.teamId);
      if (team) teams.push(team);
    }
    return teams;
  },
});

export const setStripeCustomerId = internalMutation({
  args: { teamId: v.id("teams"), stripeCustomerId: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch("teams", args.teamId, {
      stripeCustomerId: args.stripeCustomerId,
    });
  },
});

export const applySubscription = internalMutation({
  args: {
    teamId: v.id("teams"),
    plan: v.union(v.literal("free"), v.literal("solo"), v.literal("pro")),
    stripeSubscriptionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const planConfig = PLANS[args.plan as PlanId];
    await ctx.db.patch("teams", args.teamId, {
      plan: args.plan,
      usageLimitEventsPerMonth: planConfig.eventsPerMonth,
      stripeSubscriptionId: args.stripeSubscriptionId,
      // Reset notification flags so the team gets fresh alerts on the new plan
      notifiedAt80Pct: false,
      notifiedAt100Pct: false,
    });
  },
});

// Register Stripe webhook routes — call this from http.ts
export function registerStripeRoutes(http: ReturnType<typeof httpRouter>) {
  registerRoutes(http, components.stripe, {
    webhookPath: "/stripe/webhook",
    events: {
      "customer.subscription.created": async (ctx, event) => {
        const sub = event.data.object as {
          id: string;
          metadata: Record<string, string>;
          items: { data: Array<{ price: { id: string } }> };
          status: string;
        };
        if (sub.status !== "active" && sub.status !== "trialing") return;
        const teamId = sub.metadata?.teamId;
        if (!teamId) return;
        const plan = planFromPriceId(sub.items.data[0]?.price?.id);
        await ctx.runMutation(internal.billing.applySubscription, {
          teamId: teamId as Id<"teams">,
          plan,
          stripeSubscriptionId: sub.id,
        });
      },
      "customer.subscription.updated": async (ctx, event) => {
        const sub = event.data.object as {
          id: string;
          metadata: Record<string, string>;
          items: { data: Array<{ price: { id: string } }> };
          status: string;
        };
        const teamId = sub.metadata?.teamId;
        if (!teamId) return;
        const isActive = sub.status === "active" || sub.status === "trialing";
        const plan = isActive ? planFromPriceId(sub.items.data[0]?.price?.id) : "free";
        await ctx.runMutation(internal.billing.applySubscription, {
          teamId: teamId as Id<"teams">,
          plan,
          stripeSubscriptionId: isActive ? sub.id : undefined,
        });
      },
      "customer.subscription.deleted": async (ctx, event) => {
        const sub = event.data.object as {
          metadata: Record<string, string>;
        };
        const teamId = sub.metadata?.teamId;
        if (!teamId) return;
        await ctx.runMutation(internal.billing.applySubscription, {
          teamId: teamId as Id<"teams">,
          plan: "free",
        });
      },
    },
  });
}

function planFromPriceId(priceId: string | undefined): "solo" | "pro" {
  if (!priceId) throw new Error("Missing Stripe price ID on subscription");
  const soloPriceId = process.env.STRIPE_PRICE_SOLO;
  const proPriceId = process.env.STRIPE_PRICE_PRO;
  if (!soloPriceId || !proPriceId) {
    throw new Error("Missing Stripe price env vars");
  }
  if (priceId === soloPriceId) return "solo";
  if (priceId === proPriceId) return "pro";
  throw new Error(`Unknown Stripe price ID: ${priceId}`);
}
