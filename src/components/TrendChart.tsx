// Pure SVG area chart with optional secondary line overlay.
// No chart library — renders directly to SVG for zero dependencies.

const CHART_H = 160;
const CHART_W = 600;
const PAD_TOP = 20;
const PAD_BOTTOM = 28;
const PAD_LEFT = 40;
const PAD_RIGHT = 12;

const INNER_W = CHART_W - PAD_LEFT - PAD_RIGHT;
const INNER_H = CHART_H - PAD_TOP - PAD_BOTTOM;

interface Series {
  label: string;
  color: string;
  fillColor: string;
  data: { timestamp: number; value: number }[];
}

function formatAxisLabel(ts: number, rangeDays: number): string {
  const d = new Date(ts);
  if (rangeDays <= 2) {
    return `${d.getHours().toString().padStart(2, "0")}:00`;
  }
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  if (rangeDays <= 90) {
    return `${months[d.getMonth()]} ${d.getDate()}`;
  }
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

function niceMax(max: number): number {
  if (max <= 0) return 10;
  const magnitude = Math.pow(10, Math.floor(Math.log10(max)));
  const normalized = max / magnitude;
  if (normalized <= 1) return magnitude;
  if (normalized <= 2) return 2 * magnitude;
  if (normalized <= 5) return 5 * magnitude;
  return 10 * magnitude;
}

function fmtValue(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(n);
}

export function TrendChart({
  series,
  rangeDays,
}: {
  series: Series[];
  rangeDays: number;
}) {
  if (series.length === 0 || series[0].data.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-xs"
        style={{ height: CHART_H, color: "#c4bfb2" }}
      >
        No data for this range
      </div>
    );
  }

  const allData = series.flatMap((s) => s.data);
  const minTs = Math.min(...allData.map((d) => d.timestamp));
  const maxTs = Math.max(...allData.map((d) => d.timestamp));
  const tsRange = maxTs - minTs || 1;

  const rawMax = Math.max(...allData.map((d) => d.value));
  const yMax = niceMax(rawMax);

  function x(ts: number): number {
    return PAD_LEFT + ((ts - minTs) / tsRange) * INNER_W;
  }
  function y(val: number): number {
    return PAD_TOP + INNER_H - (val / yMax) * INNER_H;
  }

  // Grid lines (3 horizontal)
  const gridLines = [0, yMax / 2, yMax];

  // X-axis labels — pick ~5-6 evenly spaced
  const data0 = series[0].data;
  const labelStep = Math.max(1, Math.floor(data0.length / 6));
  const xLabels: { ts: number; label: string }[] = [];
  for (let i = 0; i < data0.length; i += labelStep) {
    xLabels.push({
      ts: data0[i].timestamp,
      label: formatAxisLabel(data0[i].timestamp, rangeDays),
    });
  }

  return (
    <svg
      viewBox={`0 0 ${CHART_W} ${CHART_H}`}
      className="w-full"
      style={{ height: CHART_H, maxHeight: CHART_H }}
      preserveAspectRatio="none"
    >
      {/* Grid lines */}
      {gridLines.map((val) => (
        <g key={val}>
          <line
            x1={PAD_LEFT}
            y1={y(val)}
            x2={CHART_W - PAD_RIGHT}
            y2={y(val)}
            stroke="#e9e6db"
            strokeWidth={1}
          />
          <text
            x={PAD_LEFT - 6}
            y={y(val) + 3}
            textAnchor="end"
            fill="#c4bfb2"
            fontSize={9}
            fontFamily="monospace"
          >
            {fmtValue(val)}
          </text>
        </g>
      ))}

      {/* X-axis labels */}
      {xLabels.map(({ ts, label }) => (
        <text
          key={ts}
          x={x(ts)}
          y={CHART_H - 4}
          textAnchor="middle"
          fill="#c4bfb2"
          fontSize={9}
          fontFamily="monospace"
        >
          {label}
        </text>
      ))}

      {/* Series — render in order (first series fills, rest are lines) */}
      {series.map((s, si) => {
        if (s.data.length === 0) return null;
        const points = s.data.map((d) => `${x(d.timestamp)},${y(d.value)}`);
        const linePath = `M${points.join("L")}`;

        if (si === 0) {
          // Filled area for primary series
          const areaPath = `${linePath}L${x(s.data[s.data.length - 1].timestamp)},${y(0)}L${x(s.data[0].timestamp)},${y(0)}Z`;
          return (
            <g key={s.label}>
              <path d={areaPath} fill={s.fillColor} />
              <path d={linePath} fill="none" stroke={s.color} strokeWidth={2} />
            </g>
          );
        }

        // Secondary series — line only
        return (
          <path
            key={s.label}
            d={linePath}
            fill="none"
            stroke={s.color}
            strokeWidth={1.5}
            strokeDasharray="4 2"
          />
        );
      })}
    </svg>
  );
}
