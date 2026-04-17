import { useQuery, useMutation, useConvexAuth } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "../../convex/_generated/api";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { GoogleLogo } from "../components/GoogleLogo";

interface Props {
  token: string;
}

export function AcceptInvitePage({ token }: Props) {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const { signIn, signOut } = useAuthActions();
  const invite = useQuery(api.invites.getInviteByToken, { token });
  const acceptInvite = useMutation(api.invites.acceptInvite);
  const navigate = useNavigate();

  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  const attempted = useRef(false);

  const attemptAccept = useCallback(async () => {
    if (accepting || accepted) return;
    setAccepting(true);
    setError(null);
    try {
      const result = await acceptInvite({ token });
      if ("error" in result) {
        setError(result.error ?? "Failed to accept invite");
        attempted.current = false; // Reset to allow retry
      } else {
        setAccepted(true);
        void navigate("/overview", { replace: true });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to accept invite";
      setError(msg);
      attempted.current = false; // Reset to allow retry
    } finally {
      setAccepting(false);
    }
  }, [accepting, accepted, acceptInvite, token, navigate]);

  // Reset one-shot guard when signed out so a fresh sign-in can auto-retry.
  useEffect(() => {
    if (!isAuthenticated) attempted.current = false;
  }, [isAuthenticated]);

  // Manual retry handler
  const handleRetry = useCallback(() => {
    attempted.current = false;
    setError(null);
    void attemptAccept();
  }, [attemptAccept]);

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
    void attemptAccept();
  }, [isAuthenticated, authLoading, invite, accepted, accepting, attemptAccept]);

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
                error ? (
                  <div className="flex flex-col gap-2">
                    <button
                      className="w-full py-3 text-xs font-bold uppercase tracking-wider cursor-pointer transition-all"
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
                      onClick={() => void handleRetry()}
                    >
                      Try again
                    </button>
                    <button
                      className="w-full py-3 text-xs font-bold uppercase tracking-wider cursor-pointer transition-all"
                      style={{
                        background: "#ffffff",
                        color: "#1a1814",
                        border: "2px solid #1a1814",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "#f7f4ec";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "#ffffff";
                      }}
                      onClick={() => void signOut()}
                    >
                      Sign out and use a different account
                    </button>
                  </div>
                ) : (
                  // Signed in and waiting for auto-accept effect to complete
                  <p
                    className="text-xs text-center py-3"
                    style={{ color: "#9b9488" }}
                  >
                    Accepting invite…
                  </p>
                )
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
                  Sign in to accept
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
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