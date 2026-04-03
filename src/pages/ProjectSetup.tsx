import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { useEffect, useState } from "react";
import { getConvexSiteUrl } from "../lib/convex";

interface ProjectSetupProps {
  sessionToken: string;
  existingConvexProjectIds?: string[];
  onDone?: () => void;
  onSignOut?: () => void;
}

type ConvexProject = { id: string; name: string; slug: string };
type CreatedProject = { name: string; writeKey: string };

const CARD_STYLE = {
  background: "#fff",
  border: "2px solid #1a1814",
  boxShadow: "6px 6px 0px #1a1814",
};

export function ProjectSetup({
  sessionToken,
  existingConvexProjectIds = [],
  onDone,
  onSignOut,
}: ProjectSetupProps) {
  const teams = useQuery(api.projects.listTeams, { sessionToken });
  const listConvexProjects = useAction(api.projects.listConvexProjects);
  const createFromConvex = useMutation(api.projects.createFromConvex);
  const createProject = useMutation(api.projects.create);

  const [convexProjects, setConvexProjects] = useState<ConvexProject[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<CreatedProject[] | null>(null);

  const [showManual, setShowManual] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualLoading, setManualLoading] = useState(false);

  // Get the user's primary team (first team they're on)
  const teamId: Id<"teams"> | undefined = teams?.[0]?._id;

  useEffect(() => {
    listConvexProjects({ sessionToken })
      .then((projects) => {
        setConvexProjects(projects);
      })
      .catch((err: Error) => {
        setLoadError(err.message);
        setConvexProjects([]);
        setShowManual(true);
      });
  }, [sessionToken, listConvexProjects]);

  // Projects not yet connected
  const available = (convexProjects ?? []).filter(
    (p) => !existingConvexProjectIds.includes(p.id),
  );

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleConnect() {
    const toCreate = available.filter((p) => selected.has(p.id));
    if (toCreate.length === 0 || !teamId) return;
    setSubmitting(true);
    try {
      const results: CreatedProject[] = [];
      for (const p of toCreate) {
        const key = await createFromConvex({
          sessionToken,
          teamId,
          name: p.name,
          convexProjectId: p.id,
        });
        results.push({ name: p.name, writeKey: key });
      }
      setCreated(results);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleManualCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!manualName.trim() || !teamId) return;
    setManualLoading(true);
    try {
      const key = await createProject({ sessionToken, teamId, name: manualName.trim() });
      setCreated([{ name: manualName.trim(), writeKey: key }]);
    } finally {
      setManualLoading(false);
    }
  }

  const isFirstTime = existingConvexProjectIds.length === 0 && !onDone;
  const pageStyle = {
    background: "#e9e6db",
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  // Success screen
  if (created) {
    return (
      <div style={pageStyle}>
        <div style={CARD_STYLE} className="w-full max-w-lg mx-4 p-8">
          <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "#9b9488" }}>
            {created.length === 1 ? "Project connected" : `${created.length} projects connected`}
          </p>
          <h2 className="text-base font-bold uppercase tracking-tight mb-6" style={{ color: "#1a1814" }}>
            {created.length === 1 ? created[0].name : "All set"}
          </h2>

          <div className="flex flex-col gap-6 mb-6">
            {created.map(({ name, writeKey }) => (
              <div key={writeKey}>
                {created.length > 1 && (
                  <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "#1a1814" }}>
                    {name}
                  </p>
                )}
                <p className="text-xs mb-1.5" style={{ color: "#6b6456" }}>
                  Set{" "}
                  <code className="px-1 py-0.5 text-[11px]" style={{ background: "#e9e6db" }}>
                    CONVALYTICS_WRITE_KEY
                  </code>{" "}
                  in your Convex environment:
                </p>
                <div
                  className="px-4 py-3 font-mono text-sm break-all mb-3"
                  style={{ background: "#1a1814", color: "#e8651c" }}
                >
                  {writeKey}
                </div>
                <p className="text-xs mb-1.5" style={{ color: "#6b6456" }}>
                  Add to your{" "}
                  <code className="px-1 py-0.5 text-[11px]" style={{ background: "#e9e6db" }}>
                    &lt;head&gt;
                  </code>:
                </p>
                <pre
                  className="text-xs overflow-auto px-3 py-2.5 whitespace-pre-wrap break-all"
                  style={{ background: "#1a1814", color: "#e8651c" }}
                >
                  {`<script defer src="${getConvexSiteUrl()}/script.js?key=${writeKey}"></script>`}
                </pre>
              </div>
            ))}
          </div>

          <button
            className="block w-full text-center py-2.5 text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
            style={{ background: "#1a1814", color: "#e9e6db", border: "2px solid #1a1814" }}
            onClick={onDone ?? (() => window.location.reload())}
          >
            {onDone ? "Back to dashboard →" : "Open dashboard →"}
          </button>
        </div>
      </div>
    );
  }

  // Selection screen
  return (
    <div style={pageStyle}>
      <div style={CARD_STYLE} className="w-full max-w-sm mx-4 p-8">
        <div className="flex items-center gap-2.5 mb-6">
          <div
            className="w-7 h-7 flex items-center justify-center flex-shrink-0"
            style={{ background: "#e8651c" }}
          >
            <span className="text-white text-xs font-bold">C</span>
          </div>
          <h1 className="text-sm font-bold uppercase tracking-tight" style={{ color: "#1a1814" }}>
            Convalytics
          </h1>
        </div>

        <p className="text-xs mb-5" style={{ color: "#6b6456" }}>
          {isFirstTime
            ? "Choose which Convex projects to track."
            : "Connect another Convex project."}
        </p>

        {loadError && (
          <div
            className="text-xs px-3 py-2.5 mb-4 leading-relaxed"
            style={{ background: "#fff3ef", border: "1px solid #e8651c", color: "#b84a0e" }}
          >
            Could not load your Convex projects. Enter a project name manually below.
          </div>
        )}

        {convexProjects === null || teams === undefined ? (
          <p className="text-xs" style={{ color: "#9b9488" }}>Loading your projects...</p>
        ) : showManual ? (
          <form className="flex flex-col gap-3" onSubmit={handleManualCreate}>
            <input
              className="text-xs px-3 py-2 focus:outline-none"
              style={{ border: "2px solid #1a1814", background: "#fff", color: "#1a1814" }}
              type="text"
              placeholder="Project name (e.g. my-saas-app)"
              value={manualName}
              onChange={(e) => setManualName(e.target.value)}
              required
              autoFocus
            />
            <button
              className="py-2.5 text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-50 cursor-pointer"
              style={{ background: "#1a1814", color: "#e9e6db", border: "2px solid #1a1814" }}
              type="submit"
              disabled={manualLoading || !manualName.trim() || !teamId}
            >
              {manualLoading ? "Creating..." : "Create project"}
            </button>
            {available.length > 0 && (
              <button
                type="button"
                onClick={() => setShowManual(false)}
                className="text-xs cursor-pointer"
                style={{ color: "#9b9488" }}
              >
                ← Back to project list
              </button>
            )}
          </form>
        ) : available.length === 0 ? (
          <div>
            <p className="text-xs mb-4" style={{ color: "#9b9488" }}>
              All your Convex projects are already connected.
            </p>
            <button
              onClick={() => setShowManual(true)}
              className="text-xs cursor-pointer"
              style={{ color: "#6b6456" }}
            >
              Create a project manually
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {available.map((project) => {
              const isSelected = selected.has(project.id);
              return (
                <button
                  key={project.id}
                  onClick={() => toggleSelect(project.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left transition-all cursor-pointer"
                  style={{
                    border: "2px solid #1a1814",
                    background: isSelected ? "#1a1814" : "#fff",
                    color: isSelected ? "#e9e6db" : "#1a1814",
                  }}
                >
                  <span
                    className="w-4 h-4 flex-shrink-0 flex items-center justify-center text-[10px] font-bold"
                    style={{
                      border: `2px solid ${isSelected ? "#e9e6db" : "#1a1814"}`,
                      background: isSelected ? "#e8651c" : "transparent",
                      color: "#fff",
                    }}
                  >
                    {isSelected ? "✓" : ""}
                  </span>
                  <span className="flex-1 text-sm font-medium">{project.name}</span>
                  <span className="text-[10px] shrink-0" style={{ color: isSelected ? "#9b9488" : "#9b9488" }}>
                    {project.slug}
                  </span>
                </button>
              );
            })}

            <button
              onClick={handleConnect}
              disabled={selected.size === 0 || submitting || !teamId}
              className="mt-2 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-40 cursor-pointer"
              style={{ background: "#e8651c", color: "#fff", border: "2px solid #e8651c" }}
            >
              {submitting
                ? "Connecting..."
                : selected.size === 0
                ? "Select projects to connect"
                : `Connect ${selected.size} project${selected.size > 1 ? "s" : ""}`}
            </button>

            <button
              onClick={() => setShowManual(true)}
              className="mt-1 text-xs cursor-pointer"
              style={{ color: "#9b9488" }}
            >
              Set up manually instead
            </button>
          </div>
        )}

        {onDone && (
          <button
            className="mt-6 text-xs cursor-pointer"
            style={{ color: "#9b9488" }}
            onClick={onDone}
          >
            ← Back to dashboard
          </button>
        )}

        {onSignOut && (
          <button
            className="mt-6 text-xs cursor-pointer"
            style={{ color: "#9b9488" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#1a1814")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#9b9488")}
            onClick={onSignOut}
          >
            Sign out
          </button>
        )}
      </div>
    </div>
  );
}
