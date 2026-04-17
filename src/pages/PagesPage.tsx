import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useState } from "react";
import { TimeRangePicker } from "../components/TimeRangePicker"
import { sinceForRange, defaultRangeForRetention, type RangeKey } from "../lib/timeRange";
import { CountryIcon, DeviceIcon, BrowserIcon, OSIcon } from "../lib/breakdownIcons";

interface PagesPageProps {
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

export function PagesPage({ writeKey, projectName, environment, retentionDays, onNavigateBilling }: PagesPageProps) {
  const [userRange, setUserRange] = useState<RangeKey | null>(null);
  const range = userRange ?? defaultRangeForRetention(retentionDays);
  const rangeLabel = range === "all" ? "all time" : `last ${range}`;
  const since = sinceForRange(range);
  const topPages = useQuery(api.pageviews.topPages, { writeKey, environment, since });
  const breakdowns = useQuery(api.pageviews.breakdowns, { writeKey, environment, since });
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
          <TimeRangePicker value={range} onChange={setUserRange} retentionDays={retentionDays} onUpgrade={onNavigateBilling} />
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
              {topPages.length === 0 && (
                <p className="text-xs mt-1" style={{ color: "#c4bfb2" }}>
                  Add the script tag to start tracking. See the{" "}
                  <a href="/skill.md" target="_blank" rel="noreferrer" className="underline" style={{ color: "#9b9488" }}>
                    skill file
                  </a>
                  .
                </p>
              )}
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

        {/* Breakdowns: Countries, Devices, Browsers, OS */}
        {breakdowns && (breakdowns.countries.length > 0 || breakdowns.devices.length > 0 || breakdowns.browsers.length > 0 || breakdowns.os.length > 0) && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-2">
            <BreakdownCard
              title="Countries"
              label="PAGE VIEWS"
              items={breakdowns.countries}
              formatName={countryName}
              renderIcon={(name) => <CountryIcon code={name} />}
            />
            <BreakdownCard
              title="Devices"
              label="PAGE VIEWS"
              items={breakdowns.devices}
              renderIcon={(name) => <DeviceIcon name={name} />}
            />
            <BreakdownCard
              title="Browsers"
              label="PAGE VIEWS"
              items={breakdowns.browsers}
              renderIcon={(name) => <BrowserIcon name={name} />}
            />
            <BreakdownCard
              title="Operating Systems"
              label="PAGE VIEWS"
              items={breakdowns.os}
              renderIcon={(name) => <OSIcon name={name} />}
            />
          </div>
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

function BreakdownCard({
  title,
  label,
  items,
  formatName,
  renderIcon,
}: {
  title: string;
  label: string;
  items: { name: string; count: number; percentage: number }[];
  formatName?: (name: string) => string;
  renderIcon?: (name: string) => React.ReactNode;
}) {
  return (
    <div style={CARD_STYLE} className="flex flex-col">
      <div
        className="flex items-center justify-between px-4 py-2.5"
        style={{ borderBottom: "2px solid #1a1814" }}
      >
        <span className="text-xs font-bold" style={{ color: "#1a1814" }}>
          {title}
        </span>
        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "#9b9488" }}>
          {label}
        </span>
      </div>
      {items.length === 0 ? (
        <p className="px-4 py-6 text-xs text-center" style={{ color: "#c4bfb2" }}>
          No data yet
        </p>
      ) : (
        <div className="flex flex-col">
          {items.map((item) => (
            <div
              key={item.name}
              className="flex items-center justify-between px-4 py-2 transition-colors"
              style={{ borderBottom: "1px solid #f0ede6" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#f5f2eb")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "")}
            >
              <span className="flex items-center gap-2 text-xs truncate" style={{ color: "#1a1814" }}>
                {renderIcon?.(item.name)}
                <span className="truncate">{formatName ? formatName(item.name) : item.name}</span>
              </span>
              <span className="text-xs font-bold tabular-nums ml-2 flex-shrink-0" style={{ color: "#1a1814" }}>
                {item.percentage}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const COUNTRY_NAMES: Record<string, string> = {
  US: "United States", GB: "United Kingdom", CA: "Canada", AU: "Australia",
  DE: "Germany", FR: "France", JP: "Japan", CN: "China", IN: "India",
  BR: "Brazil", KR: "South Korea", MX: "Mexico", IT: "Italy", ES: "Spain",
  NL: "Netherlands", SE: "Sweden", NO: "Norway", DK: "Denmark", FI: "Finland",
  CH: "Switzerland", AT: "Austria", BE: "Belgium", PL: "Poland", PT: "Portugal",
  IE: "Ireland", NZ: "New Zealand", SG: "Singapore", HK: "Hong Kong",
  TW: "Taiwan", IL: "Israel", ZA: "South Africa", AR: "Argentina",
  CO: "Colombia", CL: "Chile", TR: "Turkey", RU: "Russia", UA: "Ukraine",
  CZ: "Czech Republic", RO: "Romania", GR: "Greece", TH: "Thailand",
  PH: "Philippines", MY: "Malaysia", ID: "Indonesia", VN: "Vietnam",
  EG: "Egypt", NG: "Nigeria", KE: "Kenya", PK: "Pakistan", BD: "Bangladesh",
  AE: "UAE", SA: "Saudi Arabia", QA: "Qatar", PE: "Peru",
};

function countryName(code: string): string {
  return COUNTRY_NAMES[code] ?? code;
}
