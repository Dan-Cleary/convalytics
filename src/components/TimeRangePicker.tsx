import { useState, useRef, useEffect } from "react";
import { RANGES, type RangeKey } from "../lib/timeRange";

export type { RangeKey };

const LABELS: Record<RangeKey, string> = {
  "7d": "Last 7 Days",
  "30d": "Last 30 Days",
  "90d": "Last 90 Days",
  "1y": "Last 12 Months",
  all: "All Time",
};

export function TimeRangePicker({
  value,
  onChange,
  retentionDays,
  onUpgrade,
}: {
  value: RangeKey;
  onChange: (key: RangeKey) => void;
  retentionDays: number;
  onUpgrade?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handle(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors"
        style={{
          background: "#fff",
          color: "#1a1814",
          border: "1px solid #d5d0c8",
          borderRadius: 6,
          cursor: "pointer",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = "#1a1814";
        }}
        onMouseLeave={(e) => {
          if (!open) e.currentTarget.style.borderColor = "#d5d0c8";
        }}
      >
        {LABELS[value]}
        <svg width="10" height="6" viewBox="0 0 10 6" fill="none" style={{ marginLeft: 2 }}>
          <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1 py-1 z-50"
          style={{
            background: "#fff",
            border: "1px solid #e0ddd6",
            borderRadius: 8,
            boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
            minWidth: 180,
          }}
        >
          {RANGES.map((range) => {
            const locked = range.minRetentionDays > retentionDays;
            const active = value === range.key;

            return (
              <button
                key={range.key}
                disabled={locked && !onUpgrade}
                aria-disabled={locked ? true : undefined}
                onClick={() => {
                  if (locked) {
                    if (onUpgrade) { setOpen(false); onUpgrade(); }
                    // no-op when no upgrade handler — button is disabled
                  } else {
                    onChange(range.key);
                    setOpen(false);
                  }
                }}
                className="flex items-center justify-between w-full px-3 py-2 text-xs transition-colors"
                style={{
                  background: active ? "#f5f3ee" : "transparent",
                  color: locked ? "#8a8580" : "#1a1814",
                  cursor: locked ? (onUpgrade ? "pointer" : "not-allowed") : "pointer",
                  border: "none",
                  fontWeight: active ? 600 : 400,
                  opacity: locked && !onUpgrade ? 0.5 : 1,
                }}
                onMouseEnter={(e) => {
                  if (!active && !(locked && !onUpgrade)) {
                    e.currentTarget.style.background = locked ? "#fef8f4" : "#faf9f6";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!active) e.currentTarget.style.background = "transparent";
                }}
              >
                <span>{LABELS[range.key]}</span>
                {locked && range.upgradeLabel && (
                  <span
                    className="text-[9px] font-semibold px-1.5 py-0.5"
                    style={{
                      background: "#fef3ec",
                      color: "#e8651c",
                      borderRadius: 3,
                    }}
                  >
                    {range.upgradeLabel}
                  </span>
                )}
                {active && !locked && (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6L5 9L10 3" stroke="#1a1814" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
