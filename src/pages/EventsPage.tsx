import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Doc } from "../../convex/_generated/dataModel";
import { useState } from "react";

interface EventsPageProps {
  sessionToken: string;
  writeKey: string;
  projectName: string;
}

const CARD_STYLE = {
  background: "#fff",
  border: "2px solid #1a1814",
  boxShadow: "4px 4px 0px #1a1814",
};

export function EventsPage({ sessionToken, writeKey, projectName }: EventsPageProps) {
  const events = useQuery(api.events.listLatest, { sessionToken, writeKey, limit: 100 });
  const [filter, setFilter] = useState("");
  const [aiOnly, setAiOnly] = useState(false);

  const filtered = (events ?? []).filter((e) => {
    if (aiOnly && !e.name.startsWith("ai_")) return false;
    if (filter && !e.name.includes(filter)) return false;
    return true;
  });

  return (
    <div className="flex flex-col min-h-screen" style={{ background: "#e9e6db" }}>
      {/* Topbar */}
      <div
        className="px-6 py-3.5 flex items-center justify-between sticky top-0 z-10"
        style={{ background: "#fff", borderBottom: "2px solid #1a1814" }}
      >
        <div className="flex items-center gap-3">
          <h1 className="text-xs font-bold uppercase tracking-widest" style={{ color: "#1a1814" }}>
            Custom Events
          </h1>
          <span style={{ color: "#c4bfb2" }}>·</span>
          <span className="text-xs" style={{ color: "#9b9488" }}>{projectName}</span>
        </div>
        {events !== undefined && (
          <span className="text-xs" style={{ color: "#9b9488" }}>
            {filtered.length.toLocaleString()} event{filtered.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      <div className="p-6 flex flex-col gap-4">
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
          <button
            className="text-[10px] font-bold uppercase tracking-wider px-3 py-2 transition-all cursor-pointer"
            style={
              aiOnly
                ? { background: "#e8651c", color: "#fff", border: "2px solid #e8651c" }
                : { background: "#fff", color: "#1a1814", border: "2px solid #1a1814" }
            }
            onClick={() => setAiOnly(!aiOnly)}
          >
            AI only
          </button>
          {(filter || aiOnly) && (
            <button
              className="text-xs transition-colors cursor-pointer"
              style={{ color: "#9b9488" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#1a1814")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "#9b9488")}
              onClick={() => { setFilter(""); setAiOnly(false); }}
            >
              Clear
            </button>
          )}
        </div>

        {/* Event table */}
        <div style={CARD_STYLE}>
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
                <tr style={{ borderBottom: "2px solid #1a1814" }}>
                  <Th>Event</Th>
                  <Th>User</Th>
                  <Th>Session</Th>
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

        {events !== undefined && events.length > 0 && (
          <p className="text-xs" style={{ color: "#9b9488" }}>
            Showing last {Math.min(100, events.length)} events.
          </p>
        )}
      </div>
    </div>
  );
}

function EventRow({ event }: { event: Doc<"events"> }) {
  const isAi = event.name.startsWith("ai_");
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
        <span className="text-sm font-medium flex items-center gap-1.5" style={{ color: "#1a1814" }}>
          {isAi && (
            <span
              className="text-[10px] font-bold uppercase px-1.5 py-0.5"
              style={{ background: "#fff3eb", color: "#e8651c", border: "1px solid #e8651c" }}
            >
              AI
            </span>
          )}
          {event.name}
        </span>
      </td>
      <td className="px-5 py-3 font-mono text-xs tabular-nums" style={{ color: "#9b9488" }}>
        {event.visitorId.slice(0, 12)}
      </td>
      <td className="px-5 py-3 font-mono text-xs tabular-nums" style={{ color: "#9b9488" }}>
        {event.sessionId.slice(0, 8)}
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
