import { useQuery, useMutation, useConvexAuth } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "../../convex/_generated/api";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

interface Props {
  token: string;
}

export function AcceptInvitePage({ token }: Props) {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const { signIn } = useAuthActions();
  const invite = useQuery(api.invites.getInviteByToken, { token });
  const acceptInvite = useMutation(api.invites.acceptInvite);
  const navigate = useNavigate();

  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  const attempted = useRef(false);

  // Auto-accept once the user is signed in and the invite is valid
  useEffect(() => {
    if (
      !isAuthenticated ||
      authLoading ||
      invite?.status !== "valid" ||
      accepted ||
      accepting ||
      attempted.current
    ) {
      return;
    }
    attempted.current = true;
    setAccepting(true);
    setError(null);
    (async () => {
      try {
        const result = await acceptInvite({ token });
        if ("error" in result) {
          setError(result.error ?? "Failed to accept invite");
        } else {
          setAccepted(true);
          void navigate("/overview", { replace: true });
        }
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Failed to accept invite";
        setError(msg);
      } finally {
        setAccepting(false);
      }
    })().catch(() => {});
  }, [isAuthenticated, authLoading, invite, accepted, accepting, acceptInvite, token, navigate]);

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center"
      style={{ background: "#e9e6db" }}
    >
      <div className="w-full max-w-md mx-4">
        <div
          className="bg-white p-8"
          style={{
            border: "2px solid #1a1814",
            boxShadow: "6px 6px 0px #1a1814",
          }}
        >
          {/* Logo */}
          <div className="flex items-center gap-2.5 mb-6">
            <div
              className="w-7 h-7 flex items-center justify-center"
              style={{ background: "#e8651c" }}
            >
              <span className="text-white text-xs font-bold">C</span>
            </div>
            <h1
              className="text-base font-bold tracking-tight uppercase"
              style={{ color: "#1a1814" }}
            >
              Convalytics
            </h1>
          </div>

          {(invite === undefined || authLoading) && (
            <p
              className="text-xs text-center py-8"
              style={{ color: "#9b9488" }}
            >
              Loading…
            </p>
          )}

          {invite?.status === "not_found" && (
            <InviteMessage
              title="Invite not found"
              body="This invite link is invalid. Ask your team owner to send a new one."
            />
          )}

          {invite?.status === "expired" && (
            <InviteMessage
              title="Invite expired"
              body="This invite link has expired (invites are valid for 7 days). Ask your team owner to send a new one."
            />
          )}

          {invite?.status === "already_accepted" && (
            <InviteMessage
              title="Already joined"
              body="This invite has already been accepted."
            />
          )}

          {invite?.status === "valid" && !authLoading && (
            <div>
              <p
                className="text-sm font-bold mb-1"
                style={{ color: "#1a1814" }}
              >
                You're invited to {invite.teamName}
              </p>
              <p className="text-xs mb-5" style={{ color: "#6b6456" }}>
                Joining as <strong>{invite.invitedEmail}</strong> with role{" "}
                <strong>{invite.role}</strong>. Sign in with the Google account
                for <strong>{invite.invitedEmail}</strong> to accept.
              </p>

              {error && (
                <p
                  className="text-xs mb-3 px-3 py-2"
                  style={{
                    background: "#fef2f2",
                    color: "#dc2626",
                    border: "1px solid #fecaca",
                  }}
                >
                  {error}
                </p>
              )}

              {accepting ? (
                <p
                  className="text-xs text-center py-3"
                  style={{ color: "#9b9488" }}
                >
                  Joining team…
                </p>
              ) : isAuthenticated ? (
                // Signed in but waiting for auto-accept effect, or effect failed
                <p
                  className="text-xs text-center py-3"
                  style={{ color: "#9b9488" }}
                >
                  {error ? "" : "Accepting invite…"}
                </p>
              ) : (
                <button
                  className="w-full flex items-center justify-center gap-2.5 py-3 text-xs font-bold uppercase tracking-wider cursor-pointer transition-all"
                  style={{
                    background: "#1a1814",
                    color: "#e9e6db",
                    border: "2px solid #1a1814",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "#e8651c";
                    e.currentTarget.style.borderColor = "#e8651c";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "#1a1814";
                    e.currentTarget.style.borderColor = "#1a1814";
                  }}
                  onClick={() =>
                    void signIn("google", {
                      redirectTo: `/invite/${token}`,
                    })
                  }
                >
                  <GoogleLogo />
                  Sign in with Google
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function GoogleLogo() {
  return (
    <svg width="14" height="14" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
      <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
      <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
      <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" />
    </svg>
  );
}

function InviteMessage({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <p className="text-sm font-bold mb-1" style={{ color: "#1a1814" }}>
        {title}
      </p>
      <p className="text-xs" style={{ color: "#6b6456" }}>
        {body}
      </p>
    </div>
  );
}
