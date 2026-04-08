// Pricing tier definitions. All limits are per-month.
// Retention is in days; -1 means unlimited.

export type PlanId = "free" | "solo" | "pro";

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
    retentionDays: 30,
    displayName: "Free",
  },
  solo: {
    eventsPerMonth: 500_000,
    retentionDays: 90,
    displayName: "Solo",
  },
  pro: {
    eventsPerMonth: 5_000_000,
    retentionDays: 365,
    displayName: "Pro",
  },
};

// How many unclaimed projects can be provisioned per IP per hour (anti-abuse).
export const UNCLAIMED_PROJECTS_PER_IP_PER_HOUR = 5;

// Quota thresholds that trigger notification emails.
export const QUOTA_NOTIFY_THRESHOLDS = [0.8, 1.0] as const;
