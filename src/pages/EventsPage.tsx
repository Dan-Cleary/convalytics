import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Doc } from "../../convex/_generated/dataModel";
import { useState } from "react";

interface EventsPageProps {
  sessionToken: string;
  writeKey: string;
  projectName: string;
  environment?: string;
}

const CARD_STYLE = {
  background: "#fff",
  border: "2px solid #1a1814",
  boxShadow: "4px 4px 0px #1a1814",
};

export function EventsPage({ sessionToken, writeKey, projectName, environment }: EventsPageProps) {
  const events = useQuery(api.events.listLatest, { sessionToken, writeKey, limit: 100, environment });
  const stats = useQuery(api.events.stats7d, { sessionToken, writeKey, environment });
  const topEvents = useQuery(api.events.topEventNames, { sessionToken, writeKey, environment });
  const [filter, setFilter] = useState("");

  const filtered = (events ?? []).filter((e) => {
    if (filter && !e.name.includes(filter)) return false;
    return true;
  });

  const topEvent = topEvents?.[0];

  return (
    <div className="flex flex-col min-h-screen" style={{ background: "#e9e6db" }}>
      {/* Topbar */}
      <div
        className="px-6 py-3.5 flex items-center justify-between sticky top-0 z-10"
        style={{ background: "#fff", borderBottom: "2px solid #1a1814" }}
      >
        <div className="flex items-center gap-3">
          <h1 className="text-xs font-bold uppercase tracking-widest" style={{ color: "#1a1814" }}>
            Events
          </h1>
          <span style={{ color: "#c4bfb2" }}>·</span>
          <span className="text-xs" style={{ color: "#9b9488" }}>{projectName}</span>
        </div>
        <span
          className="text-[10px] font-medium uppercase tracking-wider px-2 py-1"
          style={{ border: "1px solid #c4bfb2", color: "#9b9488" }}
        >
          Last 7 days
        </span>
      </div>

      <div className="p-6 flex flex-col gap-5">
        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <StatCard label="Total Events" value={stats?.totalEvents} sub="this week" />
          <StatCard label="Active Users" value={stats?.activeUsers} sub="unique users" />
          <StatCard
            label="Top Event"
            value={topEvent ? topEvent.count : undefined}
            sub={topEvent?.name ?? "—"}
          />
        </div>

        {/* Top events leaderboard + filters/log side by side on large screens */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Top events */}
          <div style={CARD_STYLE} className="p-4 lg:col-span-1">
            <SectionLabel>Top Events</SectionLabel>
            {topEvents === undefined ? (
              <p className="text-xs py-4 text-center" style={{ color: "#c4bfb2" }}>Loading...</p>
            ) : topEvents.length === 0 ? (
              <p className="text-xs py-4 text-center" style={{ color: "#9b9488" }}>No events yet</p>
            ) : (
              <div className="flex flex-col">
                {topEvents.map(({ name, count }, i) => {
                  const maxCount = topEvents[0].count || 1;
                  const pct = Math.round((count / maxCount) * 100);
                  return (
                    <div
                      key={name}
                      className="flex items-center gap-2 py-2"
                      style={{ borderBottom: i < topEvents.length - 1 ? "1px solid #e9e6db" : undefined }}
                    >
                      <span
                        className="text-[10px] font-bold tabular-nums w-4 text-right flex-shrink-0"
                        style={{ color: "#c4bfb2" }}
                      >
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-medium truncate block mb-1" style={{ color: "#1a1814" }}>
                          {name}
                        </span>
                        <div className="w-full h-1" style={{ background: "#e9e6db" }}>
                          <div className="h-1" style={{ width: `${pct}%`, background: "#1a1814" }} />
                        </div>
                      </div>
                      <span
                        className="text-xs font-mono tabular-nums flex-shrink-0"
                        style={{ color: "#9b9488" }}
                      >
                        {count.toLocaleString()}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Event log */}
          <div className="lg:col-span-2 flex flex-col gap-4">
            {/* Filters */}
            <div className="flex items-center gap-2">
              <input
                className="text-xs px-3 py-2 w-64 focus:outline-none"
                style={{
                  background: "#fff",
                  border: "2px solid #1a1814",
                  color: "#1a1814",
                }}
                placeholder="Filter by event name..."
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

            {/* Event table */}
            <div style={CARD_STYLE}>
              <div
                className="px-5 py-3 flex items-center justify-between"
                style={{ borderBottom: "2px solid #1a1814" }}
              >
                <SectionLabel>Event Log</SectionLabel>
                {events !== undefined && (
                  <span className="text-[10px]" style={{ color: "#9b9488" }}>
                    {filtered.length.toLocaleString()} event{filtered.length !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
              {events === undefined ? (
                <p className="px-5 py-10 text-xs text-center" style={{ color: "#c4bfb2" }}>Loading...</p>
              ) : filtered.length === 0 ? (
                <div className="px-5 py-10 text-center">
                  <p className="text-sm" style={{ color: "#9b9488" }}>
                    {events.length === 0 ? "No events tracked yet." : "No events match your filter."}
                  </p>
                </div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr style={{ borderBottom: "1px solid #e9e6db" }}>
                      <Th>Event</Th>
                      <Th>User</Th>
                      <Th className="hidden lg:table-cell">Props</Th>
                      <Th align="right">Time</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((event) => (
                      <EventRow key={event._id} event={event} />
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: number | undefined;
  sub: string;
}) {
  return (
    <div style={CARD_STYLE} className="p-4">
      <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "#9b9488" }}>
        {label}
      </p>
      <p className="text-2xl font-bold tabular-nums" style={{ color: "#1a1814" }}>
        {value !== undefined ? value.toLocaleString() : "—"}
      </p>
      <p className="text-[10px] mt-0.5" style={{ color: "#c4bfb2" }}>
        {sub}
      </p>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "#9b9488" }}>
      {children}
    </p>
  );
}

function EventRow({ event }: { event: Doc<"events"> }) {
  const propsStr = Object.entries(event.props)
    .map(([k, v]) => `${k}=${v}`)
    .join("  ");

  return (
    <tr
      className="transition-colors"
      style={{ borderBottom: "1px solid #e9e6db" }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "#f5f2eb")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "")}
    >
      <td className="px-5 py-3">
        <span className="text-sm font-medium" style={{ color: "#1a1814" }}>
          {event.name}
        </span>
      </td>
      <td className="px-5 py-3 text-xs max-w-[200px]" style={{ color: "#9b9488" }}>
        <span className="block truncate" title={event.visitorId}>
          {event.userEmail ?? event.userName ?? event.visitorId}
        </span>
      </td>
      <td className="px-5 py-3 font-mono text-xs hidden lg:table-cell max-w-[300px] truncate" style={{ color: "#9b9488" }}>
        {propsStr || <span style={{ color: "#c4bfb2" }}>—</span>}
      </td>
      <td className="px-5 py-3 text-xs whitespace-nowrap text-right" style={{ color: "#9b9488" }}>
        {new Date(event.timestamp).toLocaleTimeString()}
      </td>
    </tr>
  );
}

function Th({ children, align, className }: { children?: React.ReactNode; align?: "right"; className?: string }) {
  return (
    <th
      className={`px-5 py-2.5 text-[10px] font-bold uppercase tracking-wider text-left ${align === "right" ? "text-right" : ""} ${className ?? ""}`}
      style={{ color: "#9b9488" }}
    >
      {children}
    </th>
  );
}
