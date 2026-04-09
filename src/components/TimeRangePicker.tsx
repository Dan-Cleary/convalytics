const MS = 24 * 60 * 60 * 1000;

// Floor to the nearest hour so Convex query args are stable within an hour
// rather than changing on every render.
function sinceHour(daysAgo: number): number {
  const ts = Date.now() - daysAgo * MS;
  return Math.floor(ts / (60 * 60 * 1000)) * (60 * 60 * 1000);
}

export type RangeKey = "7d" | "30d" | "90d" | "1y" | "all";

interface Range {
  key: RangeKey;
  label: string;
  days: number;
  minRetentionDays: number;
  upgradeLabel?: string;
}

const RANGES: Range[] = [
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

export function TimeRangePicker({
  value,
  onChange,
  retentionDays,
}: {
  value: RangeKey;
  onChange: (key: RangeKey) => void;
  retentionDays: number;
}) {
  return (
    <div className="flex items-center gap-0.5">
      {RANGES.map((range) => {
        const locked = range.minRetentionDays > retentionDays;
        const active = value === range.key;

        return (
          <div key={range.key} className="relative">
            <button
              disabled={locked}
              onClick={() => !locked && onChange(range.key)}
              title={locked ? `Upgrade to ${range.upgradeLabel} to unlock` : undefined}
              className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition-all"
              style={{
                background: active ? "#1a1814" : "transparent",
                color: active ? "#fff" : locked ? "#c8c4bc" : "#6b6456",
                border: "1px solid",
                borderColor: active ? "#1a1814" : locked ? "#e0ddd6" : "#d5d0c8",
                cursor: locked ? "default" : "pointer",
                marginLeft: "-1px",
              }}
              onMouseEnter={(e) => {
                if (!locked && !active) {
                  e.currentTarget.style.borderColor = "#1a1814";
                  e.currentTarget.style.color = "#1a1814";
                }
              }}
              onMouseLeave={(e) => {
                if (!locked && !active) {
                  e.currentTarget.style.borderColor = "#d5d0c8";
                  e.currentTarget.style.color = "#6b6456";
                }
              }}
            >
              {range.label}
            </button>
            {locked && range.upgradeLabel && (
              <span
                className="absolute -top-1.5 -right-1.5 text-[7px] font-bold px-0.5 leading-tight pointer-events-none"
                style={{ background: "#e8651c", color: "#fff" }}
              >
                {range.upgradeLabel.toUpperCase()}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
