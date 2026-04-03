import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { getConvexSiteUrl } from "../lib/convex";
import { useState } from "react";

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

export function Overview({ sessionToken, writeKey, projectName }: OverviewProps) {
  const stats = useQuery(api.pageviews.stats, { sessionToken, writeKey });
  const topPages = useQuery(api.pageviews.topPages, { sessionToken, writeKey });
  const topSources = useQuery(api.pageviews.topSources, { sessionToken, writeKey });
  const liveEvents = useQuery(api.pageviews.listLatest, { sessionToken, writeKey });
  const realtimeVisitors = useQuery(api.pageviews.realtimeVisitors, { sessionToken, writeKey });

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

      <div className="p-6 flex flex-col gap-5">
        {/* 4 stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Page Views" value={stats?.pageViews} sub="this week" />
          <StatCard label="Unique Visitors" value={stats?.uniqueVisitors} sub="this week" />
          <StatCard label="Sessions" value={stats?.sessions} sub="this week" />
          <StatCard label="Bounce Rate" value={stats?.bounceRate} sub="% single-page" suffix="%" />
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

        {/* Quick start */}
        <div style={CARD_STYLE} className="p-4">
          <SectionLabel>Quick Start</SectionLabel>
          <p className="text-xs mb-2 leading-relaxed" style={{ color: "#6b6456" }}>
            Add to your{" "}
            <code className="px-1 py-0.5 text-[11px]" style={{ background: "#e9e6db", color: "#1a1814" }}>
              &lt;head&gt;
            </code>{" "}
            for automatic page view tracking:
          </p>
          <code
            className="block text-[11px] px-3 py-2.5 break-all leading-relaxed"
            style={{ background: "#1a1814", color: "#e8651c" }}
          >
            {`<script defer src="${getConvexSiteUrl()}/script.js?key=${writeKey}"></script>`}
          </code>
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
}: {
  label: string;
  value: number | undefined;
  sub: string;
  suffix?: string;
}) {
  return (
    <div style={CARD_STYLE} className="p-5">
      <SectionLabel>{label}</SectionLabel>
      <p className="text-4xl font-bold tracking-tight leading-none mt-2" style={{ color: "#1a1814" }}>
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
