import { useQuery, useAction, useConvexAuth } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "../../convex/_generated/api";
import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { GoogleLogo } from "../components/GoogleLogo";

export function ClaimPage({ claimToken }: { claimToken: string }) {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const { signIn } = useAuthActions();
  const project = useQuery(api.projects.getByClaimToken, { claimToken });
  const claimAction = useAction(api.projects.claim);
  const navigate = useNavigate();
  const [claiming, setClaiming] = useState(false);
  const [claimedWriteKey, setClaimedWriteKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const claimed = claimedWriteKey !== null;

  const handleClaim = useCallback(async () => {
    if (!isAuthenticated) return;
    setClaiming(true);
    setError(null);
    try {
      const result = await claimAction({ claimToken });
      setClaimedWriteKey(result.writeKey);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to claim project";
      setError(msg);
    } finally {
      setClaiming(false);
    }
  }, [isAuthenticated, claimToken, claimAction]);

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center"
      style={{ background: "#e9e6db" }}
    >
      <div
        className="bg-white w-full max-w-sm mx-4 p-8"
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

        {(project === undefined || authLoading) && (
          <p className="text-xs" style={{ color: "#9b9488" }}>
            Loading...
          </p>
        )}

        {project === null && (
          <div>
            <p className="text-sm font-bold mb-2" style={{ color: "#1a1814" }}>
              Invalid claim link
            </p>
            <p className="text-xs" style={{ color: "#6b6456" }}>
              This link is invalid or has expired. Ask your agent to run{" "}
              <code
                className="px-1 py-0.5 text-[11px]"
                style={{ background: "#e9e6db" }}
              >
                npx convalytics init
              </code>{" "}
              again.
            </p>
          </div>
        )}

        {project && project.claimed && !claimed && (
          <div>
            <p className="text-sm font-bold mb-2" style={{ color: "#1a1814" }}>
              Already claimed
            </p>
            <p className="text-xs mb-4" style={{ color: "#6b6456" }}>
              <strong>{project.name}</strong> has already been claimed.
            </p>
            <a
              href="/"
              className="inline-block text-xs font-bold uppercase tracking-wider px-4 py-2.5 transition-all"
              style={{
                background: "#1a1814",
                color: "#e9e6db",
                border: "2px solid #1a1814",
              }}
            >
              Go to dashboard
            </a>
          </div>
        )}

        {project && !project.claimed && !claimed && !authLoading && (
          <div>
            <p
              className="text-[10px] font-bold uppercase tracking-widest mb-1"
              style={{ color: "#9b9488" }}
            >
              Claim project
            </p>
            <p className="text-sm font-bold mb-3" style={{ color: "#1a1814" }}>
              {project.name}
            </p>
            <p
              className="text-xs mb-5 leading-relaxed"
              style={{ color: "#6b6456" }}
            >
              Your agent set up analytics for this project. Claim it to connect
              it to your Convalytics account and view the dashboard.
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

            {claiming ? (
              <p
                className="text-xs text-center py-3"
                style={{ color: "#9b9488" }}
              >
                Claiming...
              </p>
            ) : isAuthenticated ? (
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
                onClick={() => void handleClaim()}
              >
                Claim this project
              </button>
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
                    redirectTo: `/claim/${claimToken}`,
                  })
                }
              >
                <GoogleLogo />
                Sign in to claim
              </button>
            )}
          </div>
        )}

        {claimedWriteKey && (
          <ClaimSuccess
            projectName={project?.name}
            writeKey={claimedWriteKey}
            onGoToDashboard={() =>
              void navigate(
                `/overview?project=${encodeURIComponent(claimedWriteKey)}`,
              )
            }
          />
        )}
      </div>
    </div>
  );
}

function ClaimSuccess({
  projectName,
  onGoToDashboard,
}: {
  projectName?: string;
  writeKey: string;
  onGoToDashboard: () => void;
}) {
  return (
    <div>
      <p className="text-sm font-bold mb-2" style={{ color: "#2d7a2d" }}>
        Project claimed!
      </p>
      <p className="text-xs leading-relaxed mb-5" style={{ color: "#6b6456" }}>
        <strong>{projectName}</strong> is now connected to your account.
      </p>
      <button
        onClick={onGoToDashboard}
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
      >
        Go to dashboard →
      </button>
    </div>
  );
}
