import { MAX_RETENTION_DAYS } from "../../convex/plans";

const MS = 24 * 60 * 60 * 1000;
export { MAX_RETENTION_DAYS };

export function formatEventLimit(n: number): string {
  if (n >= 1_000_000)
    return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

// Floor to the nearest hour so Convex query args are stable within an hour
// rather than changing on every render.
function sinceHour(daysAgo: number): number {
  const ts = Date.now() - daysAgo * MS;
  return Math.floor(ts / (60 * 60 * 1000)) * (60 * 60 * 1000);
}

export type RangeKey = "7d" | "30d" | "90d" | "1y" | "all";

export interface Range {
  key: RangeKey;
  label: string;
  days: number;
  minRetentionDays: number;
  upgradeLabel?: string;
}

export const RANGES: Range[] = [
  { key: "7d",  label: "7D",  days: 7,    minRetentionDays: 0    },
  { key: "30d", label: "30D", days: 30,   minRetentionDays: 0    },
  { key: "90d", label: "90D", days: 90,   minRetentionDays: 90   },
  { key: "1y",  label: "1Y",  days: 365,  minRetentionDays: 365, upgradeLabel: "Solo" },
  {
    key: "all",
    label: "All",
    days: MAX_RETENTION_DAYS,
    minRetentionDays: MAX_RETENTION_DAYS,
    upgradeLabel: "Pro",
  },
];

export function daysForRange(key: RangeKey): number {
  return RANGES.find((r) => r.key === key)!.days;
}

export function sinceForRange(key: RangeKey): number {
  const range = RANGES.find((r) => r.key === key)!;
  return range.days >= MAX_RETENTION_DAYS ? 0 : sinceHour(range.days);
}

// Default range based on plan retention — paid users land on a longer window
// so the extra history is immediately visible rather than hidden behind a click.
export function defaultRangeForRetention(retentionDays: number): RangeKey {
  if (retentionDays >= MAX_RETENTION_DAYS) return "90d"; // Pro
  if (retentionDays >= 365) return "30d";               // Solo
  return "7d";                                          // Free
}

// The best range the plan can actually show — used for the "more history" hint.
export function maxRangeForRetention(retentionDays: number): RangeKey {
  if (retentionDays >= MAX_RETENTION_DAYS) return "all";
  if (retentionDays >= 365) return "1y";
  if (retentionDays >= 90) return "90d";
  return "30d";
}
