import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { getConvexSiteUrl } from "../lib/convex";
import { useState, useCallback } from "react";

interface OverviewProps {
  sessionToken: string;
  writeKey: string;
  projectName: string;
}

const CARD_STYLE = {
  background: "#fff",
  border: "2px solid #1a1814",
  boxShadow: "4px 4px 0px #1a1814",
};

const SETUP_DISMISSED_KEY = (writeKey: string) => `cnv_setup_dismissed_${writeKey}`;

export function Overview({ sessionToken, writeKey, projectName }: OverviewProps) {
  const stats = useQuery(api.pageviews.stats, { sessionToken, writeKey });
  const topPages = useQuery(api.pageviews.topPages, { sessionToken, writeKey });
  const topSources = useQuery(api.pageviews.topSources, { sessionToken, writeKey });
  const liveEvents = useQuery(api.pageviews.listLatest, { sessionToken, writeKey });
  const realtimeVisitors = useQuery(api.pageviews.realtimeVisitors, { sessionToken, writeKey });
  const eventStats = useQuery(api.events.stats7d, { sessionToken, writeKey });

  const [setupDismissed, setSetupDismissed] = useState(() => {
    try { return localStorage.getItem(SETUP_DISMISSED_KEY(writeKey)) === "1"; } catch { return false; }
  });

  const dismissSetup = useCallback(() => {
    try { localStorage.setItem(SETUP_DISMISSED_KEY(writeKey), "1"); } catch { /* localStorage unavailable */ }
    setSetupDismissed(true);
  }, [writeKey]);

  const hasData = (stats?.pageViews ?? 0) > 0 || (liveEvents?.length ?? 0) > 0;
  const showSetup = !setupDismissed && stats !== undefined && liveEvents !== undefined && !hasData;

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
          <span
            className="text-[10px] font-medium uppercase tracking-wider px-2 py-1"
            style={{ border: "1px solid #c4bfb2", color: "#9b9488" }}
          >
            Last 7 days
          </span>
        </div>
      </div>

      {showSetup && (
        <SetupGuide writeKey={writeKey} projectName={projectName} onDismiss={dismissSetup} />
      )}

      <div className="p-6 flex flex-col gap-5">
        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard label="Page Views" value={stats?.pageViews} sub="this week" />
          <StatCard label="Unique Visitors" value={stats?.uniqueVisitors} sub="this week" />
          <StatCard label="Sessions" value={stats?.sessions} sub="this week" />
          <StatCard label="Bounce Rate" value={stats?.bounceRate} sub="% single-page" suffix="%" />
          <StatCard label="Product Events" value={eventStats?.totalEvents} sub="this week" accent />
        </div>

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
      className="mx-6 mt-6 p-5"
      style={{ background: "#fff", border: "2px solid #1a1814", boxShadow: "4px 4px 0px #1a1814" }}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest mb-0.5" style={{ color: "#9b9488" }}>
            Getting started
          </p>
          <h2 className="text-sm font-bold" style={{ color: "#1a1814" }}>
            No data yet — install tracking on <span style={{ color: "#e8651c" }}>{projectName}</span>
          </h2>
        </div>
        <button
          onClick={onDismiss}
          className="text-xs cursor-pointer ml-4 flex-shrink-0"
          style={{ color: "#c4bfb2" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#1a1814")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#c4bfb2")}
        >
          Dismiss
        </button>
      </div>

      <div className="flex flex-col lg:flex-row gap-4">
        {/* Step 1 — Web analytics */}
        <div className="flex-1">
          <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "#9b9488" }}>
            1 · Web Analytics
          </p>
          <p className="text-xs mb-2 leading-relaxed" style={{ color: "#6b6456" }}>
            Add to your <code className="px-1 py-0.5 text-[11px]" style={{ background: "#e9e6db" }}>&lt;head&gt;</code> for automatic page views:
          </p>
          <div className="relative">
            <code
              className="block text-[11px] px-3 py-2.5 break-all leading-relaxed pr-16"
              style={{ background: "#1a1814", color: "#e8651c" }}
            >
              {scriptTag}
            </code>
            <button
              onClick={() => copy(scriptTag, "script")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold uppercase tracking-wider px-2 py-1 cursor-pointer transition-all"
              style={{
                background: copied === "script" ? "#2d7a2d" : "#2e2a22",
                color: copied === "script" ? "#fff" : "#9b9488",
              }}
            >
              {copied === "script" ? "Copied" : "Copy"}
            </button>
          </div>
        </div>

        {/* Divider */}
        <div className="hidden lg:block w-px self-stretch" style={{ background: "#e9e6db" }} />

        {/* Step 2 — Product analytics */}
        <div className="flex-1">
          <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "#9b9488" }}>
            2 · Product Analytics
          </p>
          <p className="text-xs mb-3 leading-relaxed" style={{ color: "#6b6456" }}>
            Paste this into your AI coding agent. It reads your codebase, proposes events to track, and instruments them after you approve.
          </p>
          <button
            onClick={() => copy(agentPrompt, "prompt")}
            className="flex items-center gap-2 px-3 py-2 text-xs font-bold uppercase tracking-wider cursor-pointer transition-all"
            style={{
              background: copied === "prompt" ? "#2d7a2d" : "#1a1814",
              color: "#fff",
              border: `2px solid ${copied === "prompt" ? "#2d7a2d" : "#1a1814"}`,
            }}
          >
            <span>{copied === "prompt" ? "✓ Copied" : "Copy agent prompt"}</span>
          </button>
          <p className="text-[10px] mt-2" style={{ color: "#c4bfb2" }}>
            One prompt — full setup, event discovery, and instrumentation.
          </p>
        </div>
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
                <span className="text-sm truncate max-w-[160px]" style={{ color: "#1a1814" }}>
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
  return (
    <div style={CARD_STYLE} className="p-5">
      <SectionLabel>{label}</SectionLabel>
      <p
        className="text-4xl font-bold tracking-tight leading-none mt-2"
        style={{ color: accent ? "#e8651c" : "#1a1814" }}
      >
        {value === undefined ? (
          <span style={{ color: "#c4bfb2" }}>—</span>
        ) : (
          `${value.toLocaleString()}${suffix ?? ""}`
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
      <td className="px-5 py-3 font-mono text-xs tabular-nums" style={{ color: "#9b9488" }}>
        {pv.visitorId.slice(0, 8)}
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
