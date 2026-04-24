import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useState } from "react";
import { TimeRangePicker } from "../components/TimeRangePicker";
import { sinceForRange, defaultRangeForRetention, type RangeKey } from "../lib/timeRange";

interface FunnelsPageProps {
  writeKey: string;
  projectName: string;
  environment?: string;
  retentionDays: number;
  onNavigateBilling?: () => void;
}

type StepDraft = {
  kind: "event" | "pageview";
  match: string;
  label: string;
};

const CARD_STYLE = {
  background: "#fff",
  border: "2px solid #1a1814",
  boxShadow: "4px 4px 0px #1a1814",
};

const WINDOW_OPTIONS: { label: string; ms: number }[] = [
  { label: "1 hour", ms: 60 * 60 * 1000 },
  { label: "1 day", ms: 24 * 60 * 60 * 1000 },
  { label: "7 days", ms: 7 * 24 * 60 * 60 * 1000 },
  { label: "30 days", ms: 30 * 24 * 60 * 60 * 1000 },
];

export function FunnelsPage({ writeKey, projectName, environment, retentionDays, onNavigateBilling }: FunnelsPageProps) {
  const [userRange, setUserRange] = useState<RangeKey | null>(null);
  const range = userRange ?? defaultRangeForRetention(retentionDays);
  const since = sinceForRange(range);

  const funnels = useQuery(api.funnels.list, { writeKey });

  const [mode, setMode] = useState<
    | { kind: "list" }
    | { kind: "edit"; id: Id<"funnels"> | null }
    | { kind: "view"; id: Id<"funnels"> }
  >({ kind: "list" });

  return (
    <div className="flex flex-col min-h-screen" style={{ background: "#e9e6db" }}>
      <div
        className="px-6 py-3.5 flex items-center justify-between sticky top-0 z-10"
        style={{ background: "#fff", borderBottom: "2px solid #1a1814" }}
      >
        <div className="flex items-center gap-3">
          <h1 className="text-xs font-bold uppercase tracking-widest" style={{ color: "#1a1814" }}>Funnels</h1>
          <span style={{ color: "#c4bfb2" }}>·</span>
          <span className="text-xs" style={{ color: "#9b9488" }}>{projectName}</span>
        </div>
        <TimeRangePicker value={range} onChange={setUserRange} retentionDays={retentionDays} onUpgrade={onNavigateBilling} />
      </div>

      <div className="p-6 flex flex-col gap-5">
        {mode.kind === "list" && (
          <FunnelList
            funnels={funnels}
            onNew={() => setMode({ kind: "edit", id: null })}
            onOpen={(id) => setMode({ kind: "view", id })}
          />
        )}
        {mode.kind === "edit" && (
          <FunnelEditor
            writeKey={writeKey}
            funnelId={mode.id}
            onDone={(newId) => setMode(newId ? { kind: "view", id: newId } : { kind: "list" })}
            onCancel={() => setMode({ kind: "list" })}
          />
        )}
        {mode.kind === "view" && (
          <FunnelView
            funnelId={mode.id}
            since={since}
            environment={environment}
            onBack={() => setMode({ kind: "list" })}
            onEdit={() => setMode({ kind: "edit", id: mode.id })}
          />
        )}
      </div>
    </div>
  );
}

function FunnelList({
  funnels,
  onNew,
  onOpen,
}: {
  funnels: Array<{ id: Id<"funnels">; name: string; description: string | null; stepCount: number; conversionWindowMs: number; updatedAt: number }> | undefined;
  onNew: () => void;
  onOpen: (id: Id<"funnels">) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-xs" style={{ color: "#9b9488" }}>
          Saved ordered-step conversion analyses. Agents can create and query these via MCP.
        </p>
        <button
          className="text-xs font-bold uppercase tracking-widest px-4 py-2 cursor-pointer transition-colors"
          style={{ background: "#e8651c", color: "#fff", border: "2px solid #1a1814", boxShadow: "3px 3px 0px #1a1814" }}
          onClick={onNew}
        >
          + New Funnel
        </button>
      </div>

      {funnels === undefined ? (
        <p className="text-xs py-8 text-center" style={{ color: "#c4bfb2" }}>Loading...</p>
      ) : funnels.length === 0 ? (
        <div style={CARD_STYLE} className="p-10 text-center">
          <p className="text-sm mb-1" style={{ color: "#1a1814" }}>No funnels yet.</p>
          <p className="text-xs" style={{ color: "#9b9488" }}>Create one to see step-by-step conversion.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {funnels.map((f) => (
            <button
              key={f.id}
              style={CARD_STYLE}
              className="p-4 text-left cursor-pointer transition-transform"
              onClick={() => onOpen(f.id)}
              onMouseEnter={(e) => (e.currentTarget.style.transform = "translate(-1px, -1px)")}
              onMouseLeave={(e) => (e.currentTarget.style.transform = "translate(0, 0)")}
            >
              <p className="text-sm font-bold mb-1" style={{ color: "#1a1814" }}>{f.name}</p>
              {f.description && (
                <p className="text-xs mb-2 line-clamp-2" style={{ color: "#6b6456" }}>{f.description}</p>
              )}
              <div className="flex items-center gap-3 text-[10px] uppercase tracking-widest" style={{ color: "#9b9488" }}>
                <span>{f.stepCount} step{f.stepCount === 1 ? "" : "s"}</span>
                <span>·</span>
                <span>{formatWindow(f.conversionWindowMs)} window</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function FunnelEditor({
  writeKey,
  funnelId,
  onDone,
  onCancel,
}: {
  writeKey: string;
  funnelId: Id<"funnels"> | null;
  onDone: (id: Id<"funnels"> | null) => void;
  onCancel: () => void;
}) {
  const existing = useQuery(api.funnels.get, funnelId ? { funnelId } : "skip");
  const createFn = useMutation(api.funnels.create);
  const updateFn = useMutation(api.funnels.update);
  const removeFn = useMutation(api.funnels.remove);

  const [name, setName] = useState(existing?.name ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [conversionWindowMs, setConversionWindowMs] = useState(
    existing?.conversionWindowMs ?? 7 * 24 * 60 * 60 * 1000,
  );
  const [steps, setSteps] = useState<StepDraft[]>(
    existing?.steps.map((s) => ({ kind: s.kind, match: s.match, label: s.label ?? "" })) ?? [
      { kind: "event", match: "", label: "" },
      { kind: "event", match: "", label: "" },
    ],
  );
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Once the existing funnel loads, hydrate form state (for edit mode).
  if (funnelId && existing && name === "" && description === "" && steps.every((s) => s.match === "")) {
    setName(existing.name);
    setDescription(existing.description ?? "");
    setConversionWindowMs(existing.conversionWindowMs);
    setSteps(existing.steps.map((s) => ({ kind: s.kind, match: s.match, label: s.label ?? "" })));
  }

  const update = (i: number, patch: Partial<StepDraft>) => {
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  };

  const save = async () => {
    setErr(null);
    try {
      const cleanedSteps = steps
        .map((s) => ({ kind: s.kind, match: s.match.trim(), ...(s.label.trim() ? { label: s.label.trim() } : {}) }))
        .filter((s) => s.match);
      if (cleanedSteps.length < 2) {
        setErr("Need at least 2 non-empty steps");
        return;
      }
      setSaving(true);
      if (funnelId) {
        await updateFn({ funnelId, name, description, steps: cleanedSteps, conversionWindowMs });
        onDone(funnelId);
      } else {
        const id = await createFn({ writeKey, name, description, steps: cleanedSteps, conversionWindowMs });
        onDone(id);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!funnelId) return;
    if (!confirm("Delete this funnel? It's soft-deleted and can be recovered from the database.")) return;
    await removeFn({ funnelId });
    onDone(null);
  };

  return (
    <div style={CARD_STYLE} className="p-6 flex flex-col gap-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-widest" style={{ color: "#1a1814" }}>
          {funnelId ? "Edit funnel" : "New funnel"}
        </h2>
        <button className="text-xs" style={{ color: "#9b9488" }} onClick={onCancel}>Cancel</button>
      </div>

      <Field label="Name">
        <input
          className="w-full text-sm px-3 py-2 focus:outline-none"
          style={{ background: "#fff", border: "2px solid #1a1814", color: "#1a1814" }}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Signup funnel"
        />
      </Field>

      <Field label="Description (optional)">
        <input
          className="w-full text-sm px-3 py-2 focus:outline-none"
          style={{ background: "#fff", border: "2px solid #1a1814", color: "#1a1814" }}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What are we measuring?"
        />
      </Field>

      <Field label="Conversion window (max gap between consecutive steps)">
        <div className="flex gap-1">
          {WINDOW_OPTIONS.map((o) => (
            <button
              key={o.ms}
              className="px-3 py-1.5 text-xs font-medium cursor-pointer transition-colors"
              style={
                conversionWindowMs === o.ms
                  ? { background: "#1a1814", color: "#fff", border: "2px solid #1a1814" }
                  : { background: "#fff", color: "#1a1814", border: "2px solid #1a1814" }
              }
              onClick={() => setConversionWindowMs(o.ms)}
            >
              {o.label}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Steps (ordered)">
        <div className="flex flex-col gap-2">
          {steps.map((s, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="text-[10px] font-bold tabular-nums w-5 text-right pt-2.5" style={{ color: "#9b9488" }}>{i + 1}.</span>
              <select
                className="text-xs px-2 py-2 cursor-pointer focus:outline-none"
                style={{ background: "#fff", border: "2px solid #1a1814", color: "#1a1814" }}
                value={s.kind}
                onChange={(e) => update(i, { kind: e.target.value as "event" | "pageview" })}
              >
                <option value="event">Event</option>
                <option value="pageview">Pageview</option>
              </select>
              <input
                className="flex-1 text-xs px-3 py-2 focus:outline-none"
                style={{ background: "#fff", border: "2px solid #1a1814", color: "#1a1814" }}
                value={s.match}
                onChange={(e) => update(i, { match: e.target.value })}
                placeholder={s.kind === "event" ? "signup_completed" : "/pricing"}
              />
              <input
                className="text-xs px-3 py-2 w-32 focus:outline-none"
                style={{ background: "#fff", border: "2px solid #1a1814", color: "#1a1814" }}
                value={s.label}
                onChange={(e) => update(i, { label: e.target.value })}
                placeholder="Label (opt)"
              />
              {steps.length > 2 && (
                <button
                  className="text-xs px-2 py-2 cursor-pointer"
                  style={{ color: "#9b9488", background: "#fff", border: "2px solid #1a1814" }}
                  onClick={() => setSteps((prev) => prev.filter((_, idx) => idx !== i))}
                  aria-label="Remove step"
                >
                  ×
                </button>
              )}
            </div>
          ))}
          {steps.length < 10 && (
            <button
              className="text-xs font-medium uppercase tracking-widest px-3 py-1.5 cursor-pointer self-start"
              style={{ color: "#1a1814", background: "#fff", border: "2px solid #1a1814" }}
              onClick={() => setSteps((prev) => [...prev, { kind: "event", match: "", label: "" }])}
            >
              + Add step
            </button>
          )}
        </div>
      </Field>

      {err && (
        <p className="text-xs px-3 py-2" style={{ background: "#fff", border: "2px solid #c2362b", color: "#c2362b" }}>
          {err}
        </p>
      )}

      <div className="flex items-center justify-between">
        {funnelId ? (
          <button
            className="text-xs font-medium uppercase tracking-widest cursor-pointer"
            style={{ color: "#c2362b" }}
            onClick={handleDelete}
          >
            Delete
          </button>
        ) : (
          <span />
        )}
        <button
          className="text-xs font-bold uppercase tracking-widest px-5 py-2 cursor-pointer"
          style={{ background: "#e8651c", color: "#fff", border: "2px solid #1a1814", boxShadow: "3px 3px 0px #1a1814" }}
          disabled={saving}
          onClick={() => void save()}
        >
          {saving ? "Saving..." : funnelId ? "Save changes" : "Create funnel"}
        </button>
      </div>
    </div>
  );
}

function FunnelView({
  funnelId,
  since,
  environment,
  onBack,
  onEdit,
}: {
  funnelId: Id<"funnels">;
  since: number;
  environment?: string;
  onBack: () => void;
  onEdit: () => void;
}) {
  const funnel = useQuery(api.funnels.get, { funnelId });
  const result = useQuery(api.funnels.compute, { funnelId, since, environment });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <button
          className="text-xs uppercase tracking-widest cursor-pointer"
          style={{ color: "#9b9488" }}
          onClick={onBack}
        >
          ← Back
        </button>
        <span style={{ color: "#c4bfb2" }}>·</span>
        <h2 className="text-sm font-bold" style={{ color: "#1a1814" }}>{funnel?.name ?? "…"}</h2>
        <span className="flex-1" />
        <button
          className="text-xs uppercase tracking-widest cursor-pointer"
          style={{ color: "#9b9488" }}
          onClick={onEdit}
        >
          Edit
        </button>
      </div>

      {result === undefined ? (
        <p className="text-xs py-8 text-center" style={{ color: "#c4bfb2" }}>Computing...</p>
      ) : (
        <div style={CARD_STYLE} className="p-5">
          <div className="flex items-baseline justify-between mb-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "#9b9488" }}>
                Overall conversion
              </p>
              <p className="text-3xl font-bold tabular-nums" style={{ color: "#1a1814" }}>
                {Math.round(result.overallConversion * 1000) / 10}%
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-widest" style={{ color: "#9b9488" }}>
                Window: {formatWindow(result.conversionWindowMs)}
              </p>
              {(result.truncated.events || result.truncated.pageviews) && (
                <p className="text-[10px] mt-1" style={{ color: "#c2362b" }}>
                  Scan truncated — narrow the time range for exact numbers
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            {result.steps.map((s, i) => {
              const pct = i === 0 ? 100 : s.conversionFromStart * 100;
              const maxVisitors = result.steps[0]?.visitors || 1;
              const barPct = (s.visitors / maxVisitors) * 100;
              return (
                <div key={i} className="flex flex-col gap-1">
                  <div className="flex items-baseline justify-between text-xs">
                    <span style={{ color: "#1a1814" }}>
                      <span className="font-bold tabular-nums mr-2" style={{ color: "#c4bfb2" }}>{i + 1}.</span>
                      <span>{s.label || s.match}</span>
                      <span className="ml-2 text-[10px] uppercase tracking-widest" style={{ color: "#c4bfb2" }}>
                        {s.kind}
                      </span>
                    </span>
                    <span className="font-mono tabular-nums" style={{ color: "#9b9488" }}>
                      {s.visitors.toLocaleString()} · {Math.round(pct * 10) / 10}%
                    </span>
                  </div>
                  <div className="w-full h-4" style={{ background: "#e9e6db" }}>
                    <div
                      className="h-4"
                      style={{
                        width: `${Math.max(barPct, 0.5)}%`,
                        background: i === 0 ? "#1a1814" : "#e8651c",
                        transition: "width 200ms ease-out",
                      }}
                    />
                  </div>
                  {i > 0 && (
                    <div className="flex items-center gap-3 text-[10px]" style={{ color: "#9b9488" }}>
                      <span>From prev: {Math.round(s.conversionFromPrev * 1000) / 10}%</span>
                      {s.avgTimeToConvertMs !== null && (
                        <span>· Avg time: {formatDuration(s.avgTimeToConvertMs)}</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#9b9488" }}>{label}</label>
      {children}
    </div>
  );
}

function formatWindow(ms: number): string {
  const hours = ms / (60 * 60 * 1000);
  if (hours < 24) return `${Math.round(hours)}h`;
  const days = hours / 24;
  return `${Math.round(days)}d`;
}

function formatDuration(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 60 * 60_000) return `${Math.round(ms / 60_000)}m`;
  if (ms < 24 * 60 * 60_000) return `${Math.round((ms / (60 * 60_000)) * 10) / 10}h`;
  return `${Math.round((ms / (24 * 60 * 60_000)) * 10) / 10}d`;
}
