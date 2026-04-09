const MS = 24 * 60 * 60 * 1000;

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
  { key: "all", label: "All", days: 1825, minRetentionDays: 1825, upgradeLabel: "Pro"  },
];

export function sinceForRange(key: RangeKey): number {
  const range = RANGES.find((r) => r.key === key)!;
  return range.days >= 1825 ? 0 : sinceHour(range.days);
}
