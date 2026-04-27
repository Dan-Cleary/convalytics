import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Button } from "../components/Button";

export function TokensPage() {
  const usage = useQuery(api.usage.getMyUsage, {});
  const tokens = useQuery(api.apiTokens.list, {});

  const createToken = useMutation(api.apiTokens.create);
  const revokeToken = useMutation(api.apiTokens.revoke);

  const [newName, setNewName] = useState("");
  const [newScope, setNewScope] = useState<"read" | "write">("read");
  const [creating, setCreating] = useState(false);
  const [justCreatedToken, setJustCreatedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isFreePlan = usage?.plan === "free";

  async function handleCreate() {
    const name = newName.trim();
    if (!name) {
      setError("Name is required");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const { token } = await createToken({ name, scope: newScope });
      setJustCreatedToken(token);
      setNewName("");
      setNewScope("read");
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

  if (usage === undefined) {
    return <div className="p-8 text-sm text-gray-400">Loading...</div>;
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
        Team-scoped credentials for the Convalytics MCP server. Default{" "}
        <strong>read</strong> tokens let AI assistants query analytics across
        any project on the team. <strong>Write</strong> tokens additionally
        unlock funnel create/update/delete. Each tool call picks the project
        explicitly.
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
          <div className="flex flex-col gap-3">
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
              <Button
                variant="dark"
                onClick={() => void handleCreate()}
                disabled={creating || !newName.trim()}
              >
                {creating ? "Creating…" : "Create token"}
              </Button>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] uppercase tracking-widest" style={{ color: "#9b9488" }}>
                Scope
              </span>
              {(["read", "write"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  className="px-3 py-1 text-[11px] font-medium cursor-pointer"
                  style={
                    newScope === s
                      ? { background: "#1a1814", color: "#fff", border: "2px solid #1a1814" }
                      : { background: "#fff", color: "#1a1814", border: "2px solid #1a1814" }
                  }
                  onClick={() => setNewScope(s)}
                  disabled={creating}
                >
                  {s}
                </button>
              ))}
              <span className="text-[10px]" style={{ color: "#9b9488" }}>
                {newScope === "read"
                  ? "Analytics queries only."
                  : "Analytics queries + funnel create/update/delete."}
              </span>
            </div>
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
        <p
          className="text-xs font-bold uppercase tracking-wider mb-3"
          style={{ color: "#1a1814" }}
        >
          Existing tokens
        </p>
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
