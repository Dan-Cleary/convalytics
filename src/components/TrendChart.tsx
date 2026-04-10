import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

const CHART_H = 320;

interface Series {
  label: string;
  color: string;
  fillColor?: string;
  data: { timestamp: number; value: number }[];
}

function formatAxisLabel(ts: number, rangeDays: number): string {
  const d = new Date(ts);
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  if (rangeDays <= 2) return `${d.getHours().toString().padStart(2, "0")}:00`;
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

function formatTooltipDate(ts: number, rangeDays: number): string {
  const d = new Date(ts);
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  if (rangeDays <= 2)
    return `${months[d.getMonth()]} ${d.getDate()}, ${d.getHours().toString().padStart(2, "0")}:00`;
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

function fmtYAxis(n: number): string {
  if (n >= 1_000_000)
    return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: number;
  rangeDays: number;
}

function CustomTooltip({
  active,
  payload,
  label,
  rangeDays,
}: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="px-3 py-2 text-xs"
      style={{
        background: "#fff",
        border: "1px solid #e0ddd6",
        borderRadius: 8,
        boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
        whiteSpace: "nowrap",
      }}
    >
      <div
        className="font-medium mb-1.5"
        style={{ color: "#9b9488", fontSize: 10 }}
      >
        {formatTooltipDate(label as number, rangeDays)}
      </div>
      {payload.map((entry: { name: string; value: number; color: string }) => (
        <div
          key={entry.name}
          className="flex items-center justify-between gap-4"
          style={{ lineHeight: "20px" }}
        >
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block w-2 h-2 rounded-full flex-shrink-0"
              style={{ background: entry.color }}
            />
            <span style={{ color: "#6b6456" }}>{entry.name}</span>
          </span>
          <span className="font-bold tabular-nums" style={{ color: "#1a1814" }}>
            {fmtYAxis(entry.value ?? 0)}
          </span>
        </div>
      ))}
    </div>
  );
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

  // Build union of all timestamps across series and look up by value (not index)
  const allTs = new Set(series.flatMap((s) => s.data.map((d) => d.timestamp)));
  const timestamps = [...allTs].sort((a, b) => a - b);
  const chartData = timestamps.map((ts) => {
    const point: Record<string, number> = { ts };
    for (const s of series) {
      const found = s.data.find((d) => d.timestamp === ts);
      point[s.label] = found?.value ?? 0;
    }
    return point;
  });

  const labelStep = Math.max(1, Math.floor(timestamps.length / 6));
  const tickTimestamps = timestamps.filter((_, i) => i % labelStep === 0);

  return (
    <ResponsiveContainer width="100%" height={CHART_H}>
      <AreaChart
        data={chartData}
        margin={{ top: 8, right: 4, bottom: 0, left: 0 }}
      >
        <defs>
          {series.map((s, si) => (
            <linearGradient
              key={si}
              id={`fill-${si}`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop
                offset="5%"
                stopColor={s.fillColor ?? s.color}
                stopOpacity={0.2}
              />
              <stop
                offset="95%"
                stopColor={s.fillColor ?? s.color}
                stopOpacity={0}
              />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid vertical={false} stroke="#e9e6db" />
        <XAxis
          dataKey="ts"
          type="number"
          scale="time"
          domain={["dataMin", "dataMax"]}
          ticks={tickTimestamps}
          tickFormatter={(ts) => formatAxisLabel(ts as number, rangeDays)}
          tick={{ fill: "#c4bfb2", fontSize: 9, fontFamily: "monospace" }}
          axisLine={false}
          tickLine={false}
          dy={6}
        />
        <YAxis
          tickFormatter={fmtYAxis}
          tick={{ fill: "#c4bfb2", fontSize: 9, fontFamily: "monospace" }}
          axisLine={false}
          tickLine={false}
          width={32}
          tickCount={4}
        />
        <Tooltip
          content={<CustomTooltip rangeDays={rangeDays} />}
          cursor={{ stroke: "#1a1814", strokeWidth: 1, strokeOpacity: 0.2 }}
        />
        {series.map((s, si) => (
          <Area
            key={s.label}
            type="monotone"
            dataKey={s.label}
            stroke={s.color}
            strokeWidth={si === 0 ? 2 : 1.5}
            strokeDasharray={si === 0 ? undefined : "4 2"}
            fill={si === 0 ? `url(#fill-${si})` : "none"}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
