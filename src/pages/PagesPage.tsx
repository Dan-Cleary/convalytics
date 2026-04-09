import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useState } from "react";
import { TimeRangePicker } from "../components/TimeRangePicker"
import { sinceForRange, type RangeKey } from "../lib/timeRange";

interface PagesPageProps {
  sessionToken: string;
  writeKey: string;
  projectName: string;
  environment?: string;
  retentionDays: number;
}

const CARD_STYLE = {
  background: "#fff",
  border: "2px solid #1a1814",
  boxShadow: "4px 4px 0px #1a1814",
};

export function PagesPage({ sessionToken, writeKey, projectName, environment, retentionDays }: PagesPageProps) {
  const [range, setRange] = useState<RangeKey>("7d");
  const rangeLabel = range === "all" ? "all time" : `last ${range}`;
  const since = sinceForRange(range);
  const topPages = useQuery(api.pageviews.topPages, { sessionToken, writeKey, environment, since });
  const [filter, setFilter] = useState("");

  const filtered = (topPages ?? []).filter((p) =>
    !filter || p.path.includes(filter),
  );

  return (
    <div className="flex flex-col min-h-screen" style={{ background: "#e9e6db" }}>
      {/* Topbar */}
      <div
        className="px-6 py-3.5 flex items-center justify-between sticky top-0 z-10"
        style={{ background: "#fff", borderBottom: "2px solid #1a1814" }}
      >
        <div className="flex items-center gap-3">
          <h1 className="text-xs font-bold uppercase tracking-widest" style={{ color: "#1a1814" }}>
            Pages
          </h1>
          <span style={{ color: "#c4bfb2" }}>·</span>
          <span className="text-xs" style={{ color: "#9b9488" }}>{projectName}</span>
        </div>
        <div className="flex items-center gap-3">
          {topPages !== undefined && (
            <span className="text-xs" style={{ color: "#9b9488" }}>
              {filtered.length} page{filtered.length !== 1 ? "s" : ""}
            </span>
          )}
          <TimeRangePicker value={range} onChange={setRange} retentionDays={retentionDays} />
        </div>
      </div>

      <div className="p-6 flex flex-col gap-4">
        {/* Filter */}
        <div className="flex items-center gap-2">
          <input
            className="text-xs px-3 py-2 w-64 focus:outline-none font-mono"
            style={{
              background: "#fff",
              border: "2px solid #1a1814",
              color: "#1a1814",
            }}
            placeholder="Filter by path..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          {filter && (
            <button
              className="text-xs transition-colors cursor-pointer"
              style={{ color: "#9b9488" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#1a1814")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "#9b9488")}
              onClick={() => setFilter("")}
            >
              Clear
            </button>
          )}
        </div>

        {/* Table */}
        <div style={CARD_STYLE}>
          {topPages === undefined ? (
            <p className="px-5 py-10 text-xs text-center" style={{ color: "#c4bfb2" }}>Loading...</p>
          ) : filtered.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="text-sm" style={{ color: "#9b9488" }}>
                {topPages.length === 0 ? "No page views tracked yet." : "No pages match your filter."}
              </p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: "2px solid #1a1814" }}>
                  <Th>Path</Th>
                  <Th align="right">Views</Th>
                  <Th align="right">Unique Visitors</Th>
                  <Th align="right">% of Total</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((page) => (
                  <tr
                    key={page.path}
                    className="transition-colors"
                    style={{ borderBottom: "1px solid #e9e6db" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#f5f2eb")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                  >
                    <td className="px-5 py-3 font-mono text-sm font-medium" style={{ color: "#1a1814" }}>
                      {page.path}
                    </td>
                    <td className="px-5 py-3 text-xs font-mono tabular-nums text-right" style={{ color: "#9b9488" }}>
                      {page.views.toLocaleString()}
                    </td>
                    <td className="px-5 py-3 text-xs font-mono tabular-nums text-right" style={{ color: "#9b9488" }}>
                      {page.uniqueVisitors.toLocaleString()}
                    </td>
                    <td className="px-5 py-3 text-xs font-mono tabular-nums text-right" style={{ color: "#9b9488" }}>
                      {page.percentage}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {topPages !== undefined && topPages.length > 0 && (
          <p className="text-xs" style={{ color: "#9b9488" }}>
            Showing top {Math.min(20, topPages.length)} pages for {rangeLabel}.
          </p>
        )}
      </div>
    </div>
  );
}

function Th({
  children,
  align,
}: {
  children?: React.ReactNode;
  align?: "right";
}) {
  return (
    <th
      className={`px-5 py-2.5 text-[10px] font-bold uppercase tracking-wider ${align === "right" ? "text-right" : "text-left"}`}
      style={{ color: "#9b9488" }}
    >
      {children}
    </th>
  );
}
