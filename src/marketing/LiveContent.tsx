import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useAnimatedNumber } from "../lib/useAnimatedNumber";

const CARD_STYLE = {
  background: "#fff",
  border: "2px solid #1a1814",
  boxShadow: "4px 4px 0px #1a1814",
};

// Public realtime counter at /live. Reads api.live.stats (unauthed query),
// which returns the cumulative-by-day series + the all-time total. Convex
// reactivity pushes a fresh result on every ingest, so the hero number
// ticks up live and the chart's right edge extends without polling.
export function LiveContent() {
  const stats = useQuery(api.live.stats);
  const total = stats?.total;

  // Tween the displayed number toward the real total so the live ticks
  // feel like a counter rolling up rather than a jump-cut.
  const displayed = useAnimatedNumber(total, 600);

  return (
    <main className="flex-1 flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-3xl flex flex-col gap-6">
        <div
          className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest"
          style={{ color: "#9b9488" }}
        >
          <span
            aria-hidden
            className="inline-block w-2 h-2 rounded-full"
            style={{
              background: "#e8651c",
              animation: "convPulse 1.4s ease-in-out infinite",
            }}
          />
          Live · updating in real time
        </div>

        <div style={CARD_STYLE} className="px-6 py-8 flex flex-col gap-2">
          <p
            className="text-[10px] font-bold uppercase tracking-widest"
            style={{ color: "#9b9488" }}
          >
            Total events tracked
          </p>
          <p
            className="font-bold tabular-nums"
            style={{
              color: "#1a1814",
              fontSize: "clamp(48px, 9vw, 96px)",
              lineHeight: 1,
            }}
          >
            {displayed === undefined ? (
              <span style={{ color: "#c4bfb2" }}>—</span>
            ) : (
              displayed.toLocaleString()
            )}
          </p>
          <p className="text-xs" style={{ color: "#6b6456" }}>
            Page views and custom product events sent to Convalytics across
            every project, all time.
          </p>
        </div>

        <div style={CARD_STYLE} className="p-6">
          <p
            className="text-[10px] font-bold uppercase tracking-widest mb-4"
            style={{ color: "#9b9488" }}
          >
            Cumulative since launch
          </p>
          <CumulativeChart points={stats?.daily} />
        </div>

        <div
          className="flex items-center justify-between text-[10px] uppercase tracking-widest"
          style={{ color: "#9b9488" }}
        >
          <span>
            {stats === undefined
              ? "Connecting…"
              : `${stats.pageviewsTotal.toLocaleString()} page views · ${stats.eventsTotal.toLocaleString()} custom events`}
          </span>
          <a href="/" style={{ color: "#9b9488", textDecoration: "underline" }}>
            What is Convalytics? →
          </a>
        </div>
      </div>

      <style>{`
        @keyframes convPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.6); }
        }
      `}</style>
    </main>
  );
}

function CumulativeChart({
  points,
}: {
  points: { day: number; cumulative: number }[] | undefined;
}) {
  if (points === undefined) {
    return (
      <div
        className="h-48 flex items-center justify-center text-xs"
        style={{ color: "#c4bfb2" }}
      >
        Loading…
      </div>
    );
  }
  if (points.length < 2) {
    return (
      <div
        className="h-48 flex items-center justify-center text-xs"
        style={{ color: "#9b9488" }}
      >
        Not enough data yet — check back after a couple of days of ingest.
      </div>
    );
  }

  const W = 800;
  const H = 220;
  // PAD_X must be ≥ the end-marker circle's radius (5) so the dot at the
  // right edge of the series isn't clipped by the viewBox.
  const PAD_X = 8;
  const PAD_Y = 12;

  const minTs = points[0].day;
  const maxTs = points[points.length - 1].day;
  const span = Math.max(maxTs - minTs, 1);
  const maxV = points[points.length - 1].cumulative;

  const xy = points.map((p) => {
    const x = PAD_X + ((p.day - minTs) / span) * (W - 2 * PAD_X);
    const y = H - PAD_Y - (p.cumulative / maxV) * (H - 2 * PAD_Y);
    return { x, y, point: p };
  });

  const linePath = xy
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");
  const fillPath =
    `M ${xy[0].x.toFixed(1)} ${(H - PAD_Y).toFixed(1)} ` +
    xy.map((p) => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ") +
    ` L ${xy[xy.length - 1].x.toFixed(1)} ${(H - PAD_Y).toFixed(1)} Z`;

  const last = xy[xy.length - 1];

  return (
    <div className="flex flex-col gap-2">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        className="w-full"
        style={{ height: H, display: "block" }}
      >
        <path d={fillPath} fill="#e8651c" opacity="0.12" />
        <path
          d={linePath}
          fill="none"
          stroke="#1a1814"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <circle
          cx={last.x}
          cy={last.y}
          r="5"
          fill="#e8651c"
          stroke="#1a1814"
          strokeWidth="2"
        />
      </svg>
      <div
        className="flex justify-between text-[10px] uppercase tracking-widest"
        style={{ color: "#9b9488" }}
      >
        <span>{formatAxisDate(minTs)}</span>
        <span>{formatAxisDate(maxTs)}</span>
      </div>
    </div>
  );
}

function formatAxisDate(ts: number): string {
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
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}
