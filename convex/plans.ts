// Pricing tier definitions. All limits are per-month.
//
// retentionDays controls the query window shown in the UI (how far back users
// can see data). Data is physically stored for MAX_RETENTION_DAYS regardless of
// plan, so upgrading immediately unlocks historical data rather than waiting for
// it to be re-collected.

export type PlanId = "free" | "solo" | "pro";

// Physical storage limit — data older than this is hard-deleted for all plans.
// "Unlimited" on the Pro plan means up to this ceiling (~5 years).
export const MAX_RETENTION_DAYS = 1825;

export const PLANS: Record<
  PlanId,
  {
    eventsPerMonth: number;
    retentionDays: number;
    displayName: string;
  }
> = {
  free: {
    eventsPerMonth: 50_000,
    retentionDays: 90,
    displayName: "Free",
  },
  solo: {
    eventsPerMonth: 500_000,
    retentionDays: 365,
    displayName: "Solo",
  },
  pro: {
    eventsPerMonth: 5_000_000,
    retentionDays: MAX_RETENTION_DAYS,
    displayName: "Pro",
  },
};

// How many unclaimed projects can be provisioned per IP per hour (anti-abuse).
export const UNCLAIMED_PROJECTS_PER_IP_PER_HOUR = 5;

// Quota thresholds that trigger notification emails.
export const QUOTA_NOTIFY_THRESHOLDS = [0.8, 1.0] as const;
