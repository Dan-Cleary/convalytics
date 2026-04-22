import { useMutation, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

export function TokensPage() {
  const usage = useQuery(api.usage.getMyUsage, {});
  const projects = useQuery(api.projects.list);

  const claimedProjects = useMemo(
    () => (projects ?? []).filter((p) => p.teamId),
    [projects],
  );

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null,
  );
  const activeProjectId = (selectedProjectId ??
    claimedProjects[0]?._id ??
    null) as Id<"projects"> | null;

  const tokens = useQuery(
    api.apiTokens.list,
    activeProjectId ? { projectId: activeProjectId } : "skip",
  );

  const createToken = useMutation(api.apiTokens.create);
  const revokeToken = useMutation(api.apiTokens.revoke);

  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [justCreatedToken, setJustCreatedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isFreePlan = usage?.plan === "free";
  const activeProject = claimedProjects.find((p) => p._id === activeProjectId);

  async function handleCreate() {
    if (!activeProjectId) return;
    const name = newName.trim();
    if (!name) {
      setError("Name is required");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const { token } = await createToken({
        projectId: activeProjectId,
        name,
      });
      setJustCreatedToken(token);
      setNewName("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(tokenId: Id<"apiTokens">) {
    if (!confirm("Revoke this token? Any client using it will stop working."))
      return;
    await revokeToken({ tokenId });
  }

  function copyJustCreated() {
    if (!justCreatedToken) return;
    void navigator.clipboard.writeText(justCreatedToken).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  if (usage === undefined || projects === undefined) {
    return <div className="p-8 text-sm text-gray-400">Loading...</div>;
  }

  if (claimedProjects.length === 0) {
    return (
      <div className="p-8 max-w-2xl">
        <h1
          className="text-xs font-bold uppercase tracking-widest mb-6"
          style={{ color: "#1a1814" }}
        >
          API Tokens
        </h1>
        <div
          className="p-5"
          style={{ border: "2px solid #1a1814", background: "#fff" }}
        >
          <p className="text-xs" style={{ color: "#6b6456" }}>
            No claimed projects yet. Claim a project first, then come back here
            to generate tokens.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-2xl">
      <h1
        className="text-xs font-bold uppercase tracking-widest mb-2"
        style={{ color: "#1a1814" }}
      >
        API Tokens
      </h1>
      <p className="text-xs mb-6" style={{ color: "#6b6456" }}>
        Tokens scoped to one project with read-only access. Used by the
        Convalytics MCP server to let AI assistants query your analytics.
      </p>

      {isFreePlan && (
        <div
          className="p-4 mb-6"
          style={{
            border: "2px solid #1a1814",
            background: "#fff",
            boxShadow: "4px 4px 0 #e8651c",
          }}
        >
          <p className="text-xs" style={{ color: "#1a1814" }}>
            <strong>Heads up:</strong> API tokens work on every plan, but the
            Convalytics MCP server requires <strong>Solo</strong> or higher.
            {" "}
            <a
              href="/billing"
              className="underline"
              style={{ color: "#e8651c" }}
            >
              Upgrade →
            </a>
          </p>
        </div>
      )}

      {claimedProjects.length > 1 && (
        <div className="mb-6">
          <label
            className="text-[10px] font-bold uppercase tracking-wider mb-1 block"
            style={{ color: "#1a1814" }}
          >
            Project
          </label>
          <select
            value={activeProjectId ?? ""}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="w-full px-3 py-2 text-sm"
            style={{
              border: "2px solid #1a1814",
              background: "#fff",
              color: "#1a1814",
            }}
          >
            {claimedProjects.map((p) => (
              <option key={p._id} value={p._id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div
        className="p-5 mb-6"
        style={{ border: "2px solid #1a1814", background: "#fff" }}
      >
        <p
          className="text-xs font-bold uppercase tracking-wider mb-3"
          style={{ color: "#1a1814" }}
        >
          Create a new token
        </p>
        {justCreatedToken ? (
          <div>
            <p className="text-xs mb-2" style={{ color: "#6b6456" }}>
              This token will only be shown once. Copy it now and store it
              somewhere safe.
            </p>
            <div
              className="font-mono text-[11px] p-3 mb-3 break-all"
              style={{
                border: "2px solid #1a1814",
                background: "#e9e6db",
                color: "#1a1814",
              }}
            >
              {justCreatedToken}
            </div>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={copyJustCreated}
                className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider cursor-pointer"
                style={{
                  background: copied ? "#2d7a2d" : "#1a1814",
                  color: "#fff",
                  border: `2px solid ${copied ? "#2d7a2d" : "#1a1814"}`,
                }}
              >
                {copied ? "Copied" : "Copy token"}
              </button>
              <button
                onClick={() => {
                  setJustCreatedToken(null);
                  setCopied(false);
                }}
                className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider cursor-pointer"
                style={{
                  background: "#fff",
                  color: "#1a1814",
                  border: "2px solid #1a1814",
                }}
              >
                Done
              </button>
            </div>
            <details className="mt-4">
              <summary
                className="text-[10px] font-bold uppercase tracking-wider cursor-pointer"
                style={{ color: "#6b6456" }}
              >
                Claude Code install snippet
              </summary>
              <pre
                className="mt-2 p-3 text-[11px] overflow-x-auto"
                style={{
                  background: "#e9e6db",
                  border: "1px solid #d5d0c8",
                  color: "#1a1814",
                }}
              >
{`claude mcp add --transport http convalytics https://api.convalytics.dev/mcp \\
  --header "Authorization: Bearer ${justCreatedToken}"`}
              </pre>
            </details>
          </div>
        ) : (
          <div className="flex gap-2 flex-wrap">
            <input
              type="text"
              placeholder="Token name (e.g. Claude Desktop)"
              value={newName}
              onChange={(e) => {
                setNewName(e.target.value);
                setError(null);
              }}
              disabled={creating}
              maxLength={100}
              className="flex-1 min-w-[200px] px-3 py-2 text-sm"
              style={{
                border: "2px solid #1a1814",
                background: "#fff",
                color: "#1a1814",
              }}
            />
            <button
              onClick={() => void handleCreate()}
              disabled={creating || !newName.trim()}
              className="px-4 py-2 text-xs font-bold uppercase tracking-wider cursor-pointer"
              style={{
                background: "#1a1814",
                color: "#fff",
                border: "2px solid #1a1814",
                opacity: creating || !newName.trim() ? 0.5 : 1,
              }}
            >
              {creating ? "Creating…" : "Create token"}
            </button>
          </div>
        )}
        {error && (
          <p className="text-xs mt-2" style={{ color: "#c0392b" }}>
            {error}
          </p>
        )}
      </div>

      <div
        className="p-5"
        style={{ border: "2px solid #1a1814", background: "#fff" }}
      >
        <div className="flex items-baseline justify-between mb-3">
          <span
            className="text-xs font-bold uppercase tracking-wider"
            style={{ color: "#1a1814" }}
          >
            Existing tokens
          </span>
          <span className="text-[10px]" style={{ color: "#9b9488" }}>
            {activeProject?.name ?? ""}
          </span>
        </div>
        {tokens === undefined ? (
          <p className="text-xs" style={{ color: "#9b9488" }}>
            Loading…
          </p>
        ) : tokens.length === 0 ? (
          <p className="text-xs" style={{ color: "#9b9488" }}>
            No tokens yet. Create one above to connect an MCP client.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {tokens.map((t) => (
              <li
                key={t._id}
                className="flex items-center justify-between gap-3 py-2"
                style={{ borderTop: "1px solid #e9e6db" }}
              >
                <div>
                  <div
                    className="text-xs font-bold"
                    style={{
                      color: t.revokedAt ? "#9b9488" : "#1a1814",
                      textDecoration: t.revokedAt ? "line-through" : "none",
                    }}
                  >
                    {t.name}
                  </div>
                  <div className="text-[10px]" style={{ color: "#9b9488" }}>
                    {t.scope} · created{" "}
                    {new Date(t.createdAt).toLocaleDateString()}
                    {t.lastUsedAt
                      ? ` · last used ${new Date(t.lastUsedAt).toLocaleDateString()}`
                      : " · never used"}
                    {t.revokedAt ? " · revoked" : ""}
                  </div>
                </div>
                {!t.revokedAt && (
                  <button
                    onClick={() => void handleRevoke(t._id)}
                    className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider cursor-pointer"
                    style={{
                      background: "transparent",
                      color: "#c0392b",
                      border: "1px solid #c0392b",
                    }}
                  >
                    Revoke
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
