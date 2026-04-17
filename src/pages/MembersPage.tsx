import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useState } from "react";
import { Id } from "../../convex/_generated/dataModel";

export function MembersPage() {
  const data = useQuery(api.invites.listMembers, {});
  const team = useQuery(api.teams.getMyTeam, {});
  const pendingInvites = useQuery(api.invites.listPendingInvites, {});
  const createInvite = useMutation(api.invites.createInvite);
  const revokeInvite = useMutation(api.invites.revokeInvite);
  const removeMember = useMutation(api.invites.removeMember);
  const renameTeam = useMutation(api.teams.renameTeam);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const [teamNameDraft, setTeamNameDraft] = useState("");
  const [editingTeamName, setEditingTeamName] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);

  const canManage = data?.myRole === "owner" || data?.myRole === "admin";

  function startRename() {
    if (!team) return;
    setTeamNameDraft(team.name);
    setRenameError(null);
    setEditingTeamName(true);
  }

  function cancelRename() {
    setEditingTeamName(false);
    setRenameError(null);
  }

  async function submitRename(e: React.FormEvent) {
    e.preventDefault();
    const name = teamNameDraft.trim();
    if (!name || name === team?.name) {
      setEditingTeamName(false);
      return;
    }
    setRenaming(true);
    setRenameError(null);
    try {
      const result = await renameTeam({ name });
      if ("error" in result) {
        setRenameError(result.error ?? "Failed to rename team");
      } else {
        setEditingTeamName(false);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to rename team";
      setRenameError(errorMessage);
      console.error("Error renaming team:", error);
      // Do not close the editor on error
    } finally {
      setRenaming(false);
    }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    setInviteError(null);
    setInviteSuccess(false);
    try {
      const result = await createInvite({ email: email.trim(), role });
      if ("error" in result) {
        setInviteError(result.error ?? "Something went wrong");
      } else {
        setEmail("");
        setInviteSuccess(true);
        setTimeout(() => setInviteSuccess(false), 3000);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRevoke(inviteId: Id<"teamInvites">) {
    setRevokingId(inviteId);
    try {
      await revokeInvite({ inviteId });
    } finally {
      setRevokingId(null);
    }
  }

  async function handleRemove(userId: Id<"users">) {
    if (!confirm("Remove this member from the team?")) return;
    setRemovingId(userId);
    try {
      await removeMember({ targetUserId: userId });
    } finally {
      setRemovingId(null);
    }
  }

  if (data === undefined) {
    return (
      <div className="flex items-center justify-center h-64 text-xs" style={{ color: "#9b9488" }}>
        Loading…
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-64 text-xs" style={{ color: "#9b9488" }}>
        Unable to load members.
      </div>
    );
  }

  return (
    <div className="p-8 max-w-2xl">
      {/* Team name header */}
      {team && (
        <div className="mb-8">
          <p
            className="text-[10px] font-bold uppercase tracking-widest mb-2"
            style={{ color: "#9b9488" }}
          >
            Team
          </p>
          {editingTeamName ? (
            <form
              onSubmit={(e) => void submitRename(e)}
              className="flex flex-col gap-2"
            >
              <div className="flex gap-2">
                <input
                  type="text"
                  value={teamNameDraft}
                  onChange={(e) => setTeamNameDraft(e.target.value)}
                  maxLength={60}
                  autoFocus
                  className="flex-1 px-3 py-2 text-sm outline-none"
                  style={{
                    border: "1px solid #1a1814",
                    color: "#1a1814",
                    background: "#fff",
                  }}
                />
                <button
                  type="submit"
                  disabled={renaming || !teamNameDraft.trim()}
                  className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider cursor-pointer disabled:opacity-50"
                  style={{
                    background: "#1a1814",
                    color: "#fff",
                    border: "2px solid #1a1814",
                  }}
                >
                  {renaming ? "Saving…" : "Save"}
                </button>
                <button
                  type="button"
                  onClick={cancelRename}
                  disabled={renaming}
                  className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider cursor-pointer disabled:opacity-50"
                  style={{
                    background: "#fff",
                    color: "#1a1814",
                    border: "2px solid #1a1814",
                  }}
                >
                  Cancel
                </button>
              </div>
              {renameError && (
                <p className="text-[10px]" style={{ color: "#b94040" }}>
                  {renameError}
                </p>
              )}
            </form>
          ) : (
            <div className="flex items-center gap-3">
              <h1
                className="text-xl font-bold"
                style={{ color: "#1a1814" }}
              >
                {team.name}
              </h1>
              {canManage && (
                <button
                  onClick={startRename}
                  className="text-[10px] uppercase tracking-wider transition-colors cursor-pointer"
                  style={{ color: "#9b9488" }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "#1a1814")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "#9b9488")}
                >
                  Rename
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <h2
        className="text-sm font-bold uppercase tracking-widest mb-6"
        style={{ color: "#1a1814" }}
      >
        Members
      </h2>

      {/* Members list */}
      <div
        className="mb-8"
        style={{ border: "2px solid #1a1814" }}
      >
        {data.members.map((member, i) => (
          <div
            key={member.userId}
            className="flex items-center justify-between px-4 py-3"
            style={{
              borderBottom: i < data.members.length - 1 ? "1px solid #e9e6db" : undefined,
            }}
          >
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-medium" style={{ color: "#1a1814" }}>
                {member.email ?? member.userId}
              </span>
              {member.name && (
                <span className="text-[10px]" style={{ color: "#9b9488" }}>
                  {member.name}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <RoleBadge role={member.role} />
              {data.myRole === "owner" && member.userId !== data.myUserId && (
                <button
                  className="text-[10px] uppercase tracking-wider transition-colors cursor-pointer"
                  style={{ color: "#c4bfb2" }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "#b94040")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "#c4bfb2")}
                  disabled={removingId === member.userId}
                  onClick={() => void handleRemove(member.userId)}
                >
                  {removingId === member.userId ? "Removing…" : "Remove"}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Pending invites */}
      {pendingInvites && pendingInvites.length > 0 && (
        <div className="mb-8">
          <h2
            className="text-[10px] font-bold uppercase tracking-widest mb-3"
            style={{ color: "#9b9488" }}
          >
            Pending Invites
          </h2>
          <div style={{ border: "2px solid #e9e6db" }}>
            {pendingInvites.map((invite, i) => (
              <div
                key={invite._id}
                className="flex items-center justify-between px-4 py-3"
                style={{
                  borderBottom: i < pendingInvites.length - 1 ? "1px solid #e9e6db" : undefined,
                }}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs" style={{ color: "#6b6456" }}>
                    {invite.invitedEmail}
                  </span>
                  <RoleBadge role={invite.role} muted />
                </div>
                {canManage && (
                  <button
                    className="text-[10px] uppercase tracking-wider transition-colors cursor-pointer"
                    style={{ color: "#c4bfb2" }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "#b94040")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "#c4bfb2")}
                    disabled={revokingId === invite._id}
                    onClick={() => void handleRevoke(invite._id)}
                  >
                    {revokingId === invite._id ? "Revoking…" : "Revoke"}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Invite form — only for owners/admins */}
      {canManage && (
        <div>
          <h2
            className="text-[10px] font-bold uppercase tracking-widest mb-3"
            style={{ color: "#9b9488" }}
          >
            Invite Someone
          </h2>
          <form
            onSubmit={(e) => void handleInvite(e)}
            className="flex flex-col gap-3"
            style={{ border: "2px solid #1a1814", padding: "20px" }}
          >
            <div className="flex gap-2">
              <input
                type="email"
                placeholder="email@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="flex-1 px-3 py-2 text-xs outline-none"
                style={{
                  border: "1px solid #e0ddd6",
                  color: "#1a1814",
                  background: "#fff",
                }}
              />
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as "member" | "admin")}
                className="px-3 py-2 text-xs cursor-pointer outline-none"
                style={{
                  border: "1px solid #e0ddd6",
                  color: "#1a1814",
                  background: "#fff",
                }}
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            {inviteError && (
              <p className="text-[10px]" style={{ color: "#b94040" }}>
                {inviteError}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting || !email.trim()}
              className="px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer disabled:opacity-50"
              style={{
                background: inviteSuccess ? "#2d7a2d" : "#1a1814",
                color: "#fff",
                border: `2px solid ${inviteSuccess ? "#2d7a2d" : "#1a1814"}`,
                alignSelf: "flex-start",
              }}
            >
              {inviteSuccess ? "Invite sent!" : submitting ? "Sending…" : "Send invite"}
            </button>
          </form>

          <p className="text-[10px] mt-3" style={{ color: "#9b9488" }}>
            Invitees will receive an email with a link. They sign in with Google using the invited email address to join.
          </p>
        </div>
      )}
    </div>
  );
}

function RoleBadge({ role, muted = false }: { role: string; muted?: boolean }) {
  const colors: Record<string, { bg: string; text: string }> = {
    owner: { bg: "#fef3eb", text: "#e8651c" },
    admin: { bg: "#f0f4ff", text: "#4f7be8" },
    member: { bg: "#f5f4f1", text: "#9b9488" },
  };
  const c = colors[role] ?? colors.member;
  return (
    <span
      className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5"
      style={{
        background: muted ? "#f5f4f1" : c.bg,
        color: muted ? "#c4bfb2" : c.text,
      }}
    >
      {role}
    </span>
  );
}