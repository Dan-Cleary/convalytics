import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { useEffect, useState } from "react";
import { getConvexSiteUrl } from "../lib/convex";

function buildAgentPrompt(projects: CreatedProject[]): string {
  const siteUrl = getConvexSiteUrl();
  const lines: string[] = [
    "Set up Convalytics analytics in this Convex project.\n",
  ];

  for (const { name, writeKey } of projects) {
    if (projects.length > 1) lines.push(`## ${name}\n`);
    lines.push(
      `1. Set the write key in your Convex environment:\n   npx convex env set CONVALYTICS_WRITE_KEY ${writeKey}\n`,
      `2. Add this script tag to your HTML <head> (e.g. index.html or _document.tsx):\n   <script defer src="${siteUrl}/script.js?key=${writeKey}"></script>\n`,
      `3. (Optional) Track custom events anywhere in your frontend:\n   window.convalytics?.track('event_name', { key: 'value' })\n`,
      `4. (Optional) Identify users after sign-in:\n   window.convalytics?.identify(userId, { email, name })\n`,
    );
  }

  lines.push("That's it — page views are tracked automatically. No restart needed.");
  return lines.join("\n");
}

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

  const [convexProjects, setConvexProjects] = useState<ConvexProject[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<CreatedProject[] | null>(null);

  const teamId: Id<"teams"> | undefined = teams?.[0]?._id;

  useEffect(() => {
    listConvexProjects({ sessionToken })
      .then((projects) => setConvexProjects(projects))
      .catch((err: Error) => {
        setLoadError(err.message);
        setConvexProjects([]);
      });
  }, [sessionToken, listConvexProjects]);

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
    return <SuccessScreen created={created} onDone={onDone} />;
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
            Could not load your Convex projects: {loadError}
          </div>
        )}

        {convexProjects === null || teams === undefined ? (
          <p className="text-xs" style={{ color: "#9b9488" }}>Loading your projects...</p>
        ) : available.length === 0 ? (
          <p className="text-xs" style={{ color: "#9b9488" }}>
            All your Convex projects are already connected.
          </p>
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
                  <span className="text-[10px] shrink-0" style={{ color: "#9b9488" }}>
                    {project.slug}
                  </span>
                </button>
              );
            })}

            <button
              onClick={() => void handleConnect()}
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

function SuccessScreen({
  created,
  onDone,
}: {
  created: CreatedProject[];
  onDone?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const siteUrl = getConvexSiteUrl();

  function handleCopyPrompt() {
    const prompt = buildAgentPrompt(created);
    void navigator.clipboard.writeText(prompt).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const pageStyle = {
    background: "#e9e6db",
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  return (
    <div style={pageStyle}>
      <div style={CARD_STYLE} className="w-full max-w-lg mx-4 p-8">
        <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "#9b9488" }}>
          {created.length === 1 ? "Project connected" : `${created.length} projects connected`}
        </p>
        <h2 className="text-base font-bold uppercase tracking-tight mb-6" style={{ color: "#1a1814" }}>
          {created.length === 1 ? created[0].name : "All set"}
        </h2>

        {/* Copy agent prompt — primary CTA */}
        <div
          className="flex items-start gap-3 px-4 py-3 mb-6"
          style={{ background: "#f5f2eb", border: "1px solid #d5d0c8", borderRadius: 4 }}
        >
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold mb-0.5" style={{ color: "#1a1814" }}>
              Set up with your agent
            </p>
            <p className="text-xs leading-relaxed" style={{ color: "#6b6456" }}>
              Copy a ready-made prompt and paste it into Claude Code, Cursor, or any AI assistant.
            </p>
          </div>
          <button
            onClick={handleCopyPrompt}
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
            style={{
              background: copied ? "#2d7a2d" : "#e8651c",
              color: "#fff",
              border: "none",
              borderRadius: 4,
              whiteSpace: "nowrap",
            }}
          >
            {copied ? (
              <>✓ Copied</>
            ) : (
              <>
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                  <rect x="4" y="4" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M3 8H2a1 1 0 01-1-1V2a1 1 0 011-1h5a1 1 0 011 1v1" stroke="currentColor" strokeWidth="1.5"/>
                </svg>
                Copy prompt
              </>
            )}
          </button>
        </div>

        {/* Manual instructions */}
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
                {`<script defer src="${siteUrl}/script.js?key=${writeKey}"></script>`}
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
