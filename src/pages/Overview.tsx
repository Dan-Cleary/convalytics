import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { getConvexSiteUrl } from "../lib/convex";
import { useState, useCallback, useEffect, useRef } from "react";
import { TimeRangePicker } from "../components/TimeRangePicker"
import { TrendChart } from "../components/TrendChart";
import { sinceForRange, daysForRange, defaultRangeForRetention, type RangeKey } from "../lib/timeRange";

interface OverviewProps {
  sessionToken: string;
  writeKey: string;
  projectName: string;
  environment?: string;
  retentionDays: number;
  onNavigateBilling?: () => void;
}

const CARD_STYLE = {
  background: "#fff",
  border: "2px solid #1a1814",
  boxShadow: "4px 4px 0px #1a1814",
};

const SETUP_DISMISSED_KEY = (writeKey: string) => `cnv_setup_dismissed_${writeKey}`;

export function Overview({ sessionToken, writeKey, projectName, environment, retentionDays, onNavigateBilling }: OverviewProps) {
  const [userRange, setUserRange] = useState<RangeKey | null>(null);
  const range = userRange ?? defaultRangeForRetention(retentionDays);
  const since = sinceForRange(range);
  const rangeLabel = range === "all" ? "all time" : `last ${range}`;

  const stats = useQuery(api.pageviews.stats, { sessionToken, writeKey, environment, since });
  const topPages = useQuery(api.pageviews.topPages, { sessionToken, writeKey, environment, since });
  const topSources = useQuery(api.pageviews.topSources, { sessionToken, writeKey, environment, since });
  const liveEvents = useQuery(api.pageviews.listLatest, { sessionToken, writeKey, environment });
  const realtimeVisitors = useQuery(api.pageviews.realtimeVisitors, { sessionToken, writeKey, environment });
  const eventStats = useQuery(api.events.stats, { sessionToken, writeKey, environment, since });
  const pvTimeSeries = useQuery(api.pageviews.timeSeries, { sessionToken, writeKey, environment, since });
  const evTimeSeries = useQuery(api.events.timeSeries, { sessionToken, writeKey, environment, since });

  const rangeDays = daysForRange(range);

  // Unscoped queries for setup banner (project-level data check)
  const statsUnscoped = useQuery(api.pageviews.stats, { sessionToken, writeKey });
  const liveEventsUnscoped = useQuery(api.pageviews.listLatest, { sessionToken, writeKey });
  const eventStatsUnscoped = useQuery(api.events.stats, { sessionToken, writeKey });

  const [setupDismissed, setSetupDismissed] = useState(() => {
    try { return localStorage.getItem(SETUP_DISMISSED_KEY(writeKey)) === "1"; } catch { return false; }
  });

  const dismissSetup = useCallback(() => {
    try { localStorage.setItem(SETUP_DISMISSED_KEY(writeKey), "1"); } catch { /* localStorage unavailable */ }
    setSetupDismissed(true);
  }, [writeKey]);

  const hasData = (statsUnscoped?.pageViews ?? 0) > 0 || (liveEventsUnscoped?.length ?? 0) > 0 || (eventStatsUnscoped?.totalEvents ?? 0) > 0;
  const showSetup = !setupDismissed && statsUnscoped !== undefined && liveEventsUnscoped !== undefined && eventStatsUnscoped !== undefined && !hasData;

  return (
    <div className="flex flex-col min-h-screen" style={{ background: "#e9e6db" }}>
      {/* Topbar */}
      <div
        className="px-6 py-3.5 flex items-center justify-between sticky top-0 z-10"
        style={{ background: "#fff", borderBottom: "2px solid #1a1814" }}
      >
        <div className="flex items-center gap-3">
          <h1 className="text-xs font-bold uppercase tracking-widest" style={{ color: "#1a1814" }}>
            Overview
          </h1>
          <span style={{ color: "#c4bfb2" }}>·</span>
          <span className="text-xs" style={{ color: "#9b9488" }}>{projectName}</span>
        </div>
        <div className="flex items-center gap-3">
          {realtimeVisitors !== undefined && (
            <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2 py-1"
              style={{ background: "#e8f5e8", color: "#2d7a2d", border: "1px solid #2d7a2d" }}>
              <span className="w-1.5 h-1.5 rounded-full bg-green-600 animate-pulse" />
              {realtimeVisitors} now
            </span>
          )}
          <TimeRangePicker value={range} onChange={setUserRange} retentionDays={retentionDays} onUpgrade={onNavigateBilling} />
        </div>
      </div>

      {showSetup && (
        <SetupGuide writeKey={writeKey} projectName={projectName} onDismiss={dismissSetup} />
      )}

      <div className="p-6 flex flex-col gap-5">
        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard label="Page Views" value={stats?.pageViews} sub={rangeLabel} />
          <StatCard label="Unique Visitors" value={stats?.uniqueVisitors} sub={rangeLabel} />
          <StatCard label="Sessions" value={stats?.sessions} sub={rangeLabel} />
          <StatCard label="Bounce Rate" value={stats?.bounceRate} sub="% single-page" suffix="%" />
          <StatCard label="Product Events" value={eventStats?.totalEvents} sub={rangeLabel} accent />
        </div>

        {/* Trend chart */}
        {pvTimeSeries !== undefined && (
          <div style={CARD_STYLE} className="p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#9b9488" }}>
                Traffic Trend
              </p>
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1.5 text-[10px]" style={{ color: "#4f7be8" }}>
                  <span className="inline-block w-3 h-0.5" style={{ background: "#4f7be8" }} />
                  Page views
                </span>
                <span className="flex items-center gap-1.5 text-[10px]" style={{ color: "#e8651c" }}>
                  <span className="inline-block w-3 h-0.5" style={{ background: "#e8651c", borderTop: "1px dashed #e8651c" }} />
                  Visitors
                </span>
                {evTimeSeries && evTimeSeries.some((d) => d.count > 0) && (
                  <span className="flex items-center gap-1.5 text-[10px]" style={{ color: "#2d7a2d" }}>
                    <span className="inline-block w-3 h-0.5" style={{ background: "#2d7a2d", borderTop: "1px dashed #2d7a2d" }} />
                    Events
                  </span>
                )}
              </div>
            </div>
            <TrendChart
              rangeDays={rangeDays}
              series={[
                {
                  label: "Page views",
                  color: "#4f7be8",
                  data: pvTimeSeries.map((d) => ({ timestamp: d.timestamp, value: d.views })),
                },
                {
                  label: "Visitors",
                  color: "#e8651c",
                  data: pvTimeSeries.map((d) => ({ timestamp: d.timestamp, value: d.visitors })),
                },
                ...(evTimeSeries && evTimeSeries.some((d) => d.count > 0)
                  ? [
                      {
                        label: "Events",
                        color: "#2d7a2d",
                              data: evTimeSeries.map((d) => ({ timestamp: d.timestamp, value: d.count })),
                      },
                    ]
                  : []),
              ]}
            />
          </div>
        )}

        {/* Top pages + traffic sources */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Top pages */}
          <div style={CARD_STYLE} className="p-4">
            <SectionLabel>Top Pages</SectionLabel>
            {topPages === undefined ? (
              <p className="text-xs py-4 text-center" style={{ color: "#c4bfb2" }}>Loading...</p>
            ) : topPages.length === 0 ? (
              <EmptyState label="No page views yet" />
            ) : (
              <div className="flex flex-col">
                {topPages.slice(0, 5).map(({ path, views, percentage }) => (
                  <div
                    key={path}
                    className="flex items-center justify-between py-2"
                    style={{ borderBottom: "1px solid #e9e6db" }}
                  >
                    <span className="text-sm truncate max-w-[180px] font-mono" style={{ color: "#1a1814" }}>
                      {path}
                    </span>
                    <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                      <span className="text-xs font-mono tabular-nums" style={{ color: "#9b9488" }}>
                        {views.toLocaleString()}
                      </span>
                      <span className="text-[10px]" style={{ color: "#c4bfb2" }}>
                        {percentage}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Traffic sources */}
          <div style={CARD_STYLE} className="p-4">
            <TrafficSources topSources={topSources} />
          </div>
        </div>

        {/* Live page view feed */}
        <div style={CARD_STYLE}>
          <div
            className="px-5 py-3.5 flex items-center justify-between"
            style={{ borderBottom: "2px solid #1a1814" }}
          >
            <SectionLabel>Live Feed</SectionLabel>
            <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2 py-1"
              style={{ background: "#e8f5e8", color: "#2d7a2d", border: "1px solid #2d7a2d" }}>
              <span className="w-1.5 h-1.5 rounded-full bg-green-600 animate-pulse" />
              Live
            </span>
          </div>
          {liveEvents === undefined ? (
            <p className="px-5 py-10 text-xs text-center" style={{ color: "#c4bfb2" }}>Loading...</p>
          ) : liveEvents.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="text-sm" style={{ color: "#9b9488" }}>No page views yet.</p>
              <p className="text-xs mt-1" style={{ color: "#c4bfb2" }}>
                Add the script tag to see traffic in real time.
              </p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: "1px solid #e9e6db" }}>
                  <Th>Path</Th>
                  <Th className="hidden md:table-cell">Title</Th>
                  <Th className="hidden lg:table-cell">Referrer</Th>
                  <Th>Visitor</Th>
                  <Th align="right">Time</Th>
                </tr>
              </thead>
              <tbody>
                {liveEvents.map((pv) => (
                  <PageViewRow key={pv._id} pv={pv} />
                ))}
              </tbody>
            </table>
          )}
        </div>

      </div>
    </div>
  );
}

function SetupGuide({
  writeKey,
  projectName,
  onDismiss,
}: {
  writeKey: string;
  projectName: string;
  onDismiss: () => void;
}) {
  const siteUrl = getConvexSiteUrl();
  const scriptTag = `<script defer src="${siteUrl}/script.js?key=${writeKey}"></script>`;
  const [copied, setCopied] = useState<"script" | "prompt" | null>(null);

  function copy(text: string, which: "script" | "prompt") {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(which);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  const agentPrompt = `Install Convalytics analytics in this Convex project (${projectName}).

First, ask me: do I want (A) web analytics only — page views, sessions, bounce
rate — or (B) web analytics + product analytics for signups, payments, etc.?

## Option A — Web analytics only

  npx convalytics init ${writeKey}

This adds the script tag to index.html. Page views start flowing automatically.
For non-Vite projects, add this to <head>:

${scriptTag}

Done — no further setup needed.

## Option B — Web + product analytics

  npx convalytics init ${writeKey}

Same as above, plus installs the Convex component. Then read convex/schema.ts
and all files in convex/. Propose a tracking plan:

  1. event_name — file.ts → functionName — props: { key }

Wait for me to approve, then instrument each with:

  import { analytics } from "./analytics";
  await analytics.track(ctx, { name: "event_name", userId: String(userId), props: {} });

Verify: npx convalytics verify ${writeKey}

Full reference: .claude/skills/convalytics/SKILL.md`;

  return (
    <div
      className="mx-6 mt-6 p-5 flex items-center justify-between gap-6"
      style={{ background: "#fff", border: "2px solid #1a1814", boxShadow: "4px 4px 0px #1a1814" }}
    >
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest mb-0.5" style={{ color: "#9b9488" }}>
          Getting started
        </p>
        <h2 className="text-sm font-bold mb-1" style={{ color: "#1a1814" }}>
          No data yet — install tracking on <span style={{ color: "#e8651c" }}>{projectName}</span>
        </h2>
        <p className="text-xs leading-relaxed" style={{ color: "#6b6456" }}>
          Paste the agent prompt into Claude Code, Cursor, or any AI assistant — it handles the full setup.
        </p>
      </div>

      <div className="flex items-center gap-3 flex-shrink-0">
        <button
          onClick={() => copy(agentPrompt, "prompt")}
          className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold uppercase tracking-wider cursor-pointer transition-all"
          style={{
            background: copied === "prompt" ? "#2d7a2d" : "#1a1814",
            color: "#fff",
            border: `2px solid ${copied === "prompt" ? "#2d7a2d" : "#1a1814"}`,
            whiteSpace: "nowrap",
          }}
        >
          {copied === "prompt" ? "✓ Copied" : "Copy agent prompt"}
        </button>
        <button
          onClick={onDismiss}
          className="text-xs cursor-pointer flex-shrink-0"
          style={{ color: "#c4bfb2" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#1a1814")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#c4bfb2")}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

function TrafficSources({
  topSources,
}: {
  topSources: { referrers: { source: string; visits: number }[]; campaigns: { campaign: string; visits: number }[] } | undefined;
}) {
  const [tab, setTab] = useState<"referrers" | "campaigns">("referrers");

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <SectionLabel>Traffic Sources</SectionLabel>
        <div className="flex gap-1">
          {(["referrers", "campaigns"] as const).map((t) => (
            <button
              key={t}
              className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 cursor-pointer transition-all"
              style={
                tab === t
                  ? { background: "#1a1814", color: "#e9e6db" }
                  : { background: "#e9e6db", color: "#9b9488" }
              }
              onClick={() => setTab(t)}
            >
              {t === "referrers" ? "Referrers" : "UTM"}
            </button>
          ))}
        </div>
      </div>
      {topSources === undefined ? (
        <p className="text-xs py-4 text-center" style={{ color: "#c4bfb2" }}>Loading...</p>
      ) : tab === "referrers" ? (
        topSources.referrers.length === 0 ? (
          <EmptyState label="No referrer data yet" />
        ) : (
          <div className="flex flex-col">
            {topSources.referrers.map(({ source, visits }) => (
              <div
                key={source}
                className="flex items-center justify-between py-2"
                style={{ borderBottom: "1px solid #e9e6db" }}
              >
                <span className="flex items-center gap-2 text-sm truncate max-w-[200px]" style={{ color: "#1a1814" }}>
                  {source !== "(direct)" && (
                    <img
                      src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(source)}&sz=32`}
                      alt=""
                      width={14}
                      height={14}
                      className="flex-shrink-0"
                      style={{ borderRadius: 2 }}
                      loading="lazy"
                    />
                  )}
                  {source}
                </span>
                <span className="text-xs font-mono tabular-nums ml-2 flex-shrink-0" style={{ color: "#9b9488" }}>
                  {visits.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )
      ) : topSources.campaigns.length === 0 ? (
        <EmptyState label="No UTM campaign data yet" />
      ) : (
        <div className="flex flex-col">
          {topSources.campaigns.map(({ campaign, visits }) => (
            <div
              key={campaign}
              className="flex items-center justify-between py-2"
              style={{ borderBottom: "1px solid #e9e6db" }}
            >
              <span className="text-sm truncate max-w-[160px]" style={{ color: "#1a1814" }}>
                {campaign}
              </span>
              <span className="text-xs font-mono tabular-nums ml-2 flex-shrink-0" style={{ color: "#9b9488" }}>
                {visits.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function useAnimatedNumber(target: number | undefined, duration = 400): number | undefined {
  const [display, setDisplay] = useState(target);
  const rafRef = useRef<number>(0);
  const startRef = useRef<{ from: number; to: number; t0: number } | null>(null);

  useEffect(() => {
    if (target === undefined) {
      setDisplay(undefined);
      return;
    }
    const from = display ?? 0;
    if (from === target) {
      setDisplay(target);
      return;
    }
    startRef.current = { from, to: target, t0: performance.now() };

    function tick(now: number) {
      const s = startRef.current;
      if (!s) return;
      const elapsed = now - s.t0;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(s.from + (s.to - s.from) * eased));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration]);

  return display;
}

function StatCard({
  label,
  value,
  sub,
  suffix,
  accent,
}: {
  label: string;
  value: number | undefined;
  sub: string;
  suffix?: string;
  accent?: boolean;
}) {
  const animated = useAnimatedNumber(value);

  return (
    <div style={CARD_STYLE} className="p-5">
      <SectionLabel>{label}</SectionLabel>
      <p
        className="text-4xl font-bold tracking-tight leading-none mt-2"
        style={{ color: accent ? "#e8651c" : "#1a1814" }}
      >
        {animated === undefined ? (
          <span style={{ color: "#c4bfb2" }}>—</span>
        ) : (
          `${animated.toLocaleString()}${suffix ?? ""}`
        )}
      </p>
      <p className="text-xs mt-2" style={{ color: "#9b9488" }}>{sub}</p>
    </div>
  );
}

function PageViewRow({
  pv,
}: {
  pv: {
    _id: string;
    path: string;
    title: string;
    referrerHost: string;
    visitorId: string;
    timestamp: number;
    userEmail?: string;
    userName?: string;
  };
}) {
  return (
    <tr
      className="transition-colors"
      style={{ borderBottom: "1px solid #e9e6db" }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "#f5f2eb")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "")}
    >
      <td className="px-5 py-3 font-mono text-sm font-medium" style={{ color: "#1a1814" }}>
        {pv.path}
      </td>
      <td className="px-5 py-3 text-xs hidden md:table-cell truncate max-w-[200px]" style={{ color: "#9b9488" }}>
        {pv.title || <span style={{ color: "#c4bfb2" }}>—</span>}
      </td>
      <td className="px-5 py-3 text-xs hidden lg:table-cell" style={{ color: "#9b9488" }}>
        {pv.referrerHost || <span style={{ color: "#c4bfb2" }}>(direct)</span>}
      </td>
      <td className="px-5 py-3 text-xs tabular-nums" style={{ color: "#9b9488" }}>
        {pv.userEmail ? (
          <span title={pv.visitorId}>{pv.userEmail}</span>
        ) : pv.userName ? (
          <span title={pv.visitorId}>{pv.userName}</span>
        ) : (
          <span className="font-mono" title={pv.visitorId}>{pv.visitorId}</span>
        )}
      </td>
      <td className="px-5 py-3 text-xs whitespace-nowrap text-right" style={{ color: "#9b9488" }}>
        {relativeTime(pv.timestamp)}
      </td>
    </tr>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: "#9b9488" }}>
      {children}
    </p>
  );
}

function Th({
  children,
  align,
  className,
}: {
  children?: React.ReactNode;
  align?: "right";
  className?: string;
}) {
  return (
    <th
      className={`px-5 py-2.5 text-[10px] font-bold uppercase tracking-wider text-left ${align === "right" ? "text-right" : ""} ${className ?? ""}`}
      style={{ color: "#9b9488" }}
    >
      {children}
    </th>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="py-6 text-center">
      <p className="text-sm" style={{ color: "#9b9488" }}>{label}</p>
    </div>
  );
}

function relativeTime(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const diffS = Math.floor(diffMs / 1000);
  if (diffS < 5) return "just now";
  if (diffS < 60) return `${diffS}s ago`;
  const diffM = Math.floor(diffS / 60);
  if (diffM < 60) return `${diffM}m ago`;
  const diffH = Math.floor(diffM / 60);
  if (diffH < 24) return `${diffH}h ago`;
  return `${Math.floor(diffH / 24)}d ago`;
}