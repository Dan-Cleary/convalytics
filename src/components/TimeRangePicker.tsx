import { RANGES, type RangeKey } from "../lib/timeRange";

export type { RangeKey };

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
