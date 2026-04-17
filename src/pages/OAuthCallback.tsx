import { useEffect, useRef, useState } from "react";
import { useAction, useConvexAuth } from "convex/react";
import { useNavigate } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import { clearPkce, getStoredPkce, getReturnTo } from "../lib/auth";

export function OAuthCallback() {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const exchangeCode = useAction(api.oauth.exchangeCode);
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (ran.current) return;
    // Wait for Convex Auth to hydrate before calling exchangeCode — the
    // action uses requireAuth and would otherwise throw "Not authenticated".
    if (authLoading) return;
    if (!isAuthenticated) {
      setError(
        "You need to be signed in to connect a Convex team. Sign in first and try again.",
      );
      ran.current = true;
      return;
    }
    ran.current = true;

    void (async () => {
      // OAuth params were stashed in sessionStorage by main.tsx before
      // ConvexAuthProvider could consume them (ConvexAuth globally reads+removes
      // callback params from the URL on every page mount).
      const code = sessionStorage.getItem("convex_team_oauth_code");
      const returnedState =
        sessionStorage.getItem("convex_team_oauth_state") ??
        new URLSearchParams(window.location.search).get("state");
      sessionStorage.removeItem("convex_team_oauth_code");
      sessionStorage.removeItem("convex_team_oauth_state");
      const pkce = getStoredPkce();

      if (!code || !returnedState || !pkce) {
        const missing = [
          !code &&
            "code (not in sessionStorage — ConvexAuth may have consumed it)",
          !returnedState && "state (not in sessionStorage/URL)",
          !pkce && "PKCE verifier (not in localStorage)",
        ]
          .filter(Boolean)
          .join(", ");
        setError(`Missing: ${missing}. URL: ${window.location.href}`);
        return;
      }

      if (returnedState !== pkce.state) {
        setError("State mismatch — possible CSRF. Please try again.");
        return;
      }

      const redirectUri = `${window.location.origin}/oauth/callback`;

      try {
        await exchangeCode({ code, codeVerifier: pkce.verifier, redirectUri });
        clearPkce();
        const returnTo = getReturnTo();
        void navigate(returnTo ?? "/", { replace: true });
      } catch (err) {
        clearPkce();
        setError((err as Error).message ?? "Connect failed. Please try again.");
      }
    })();
  }, [exchangeCode, navigate, isAuthenticated, authLoading]);

  const bg = { background: "#e9e6db" };

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={bg}>
        <div
          className="bg-white w-full max-w-sm mx-4 px-8 py-10 text-center"
          style={{
            border: "2px solid #1a1814",
            boxShadow: "6px 6px 0 #1a1814",
          }}
        >
          <p
            className="text-sm font-bold uppercase tracking-wide mb-2"
            style={{ color: "#1a1814" }}
          >
            Connect failed
          </p>
          <p className="text-xs mb-6 break-all" style={{ color: "#e8651c" }}>
            {error}
          </p>
          <a
            href="/"
            className="text-xs uppercase tracking-wider transition-colors"
            style={{ color: "#9b9488" }}
          >
            Back to dashboard →
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={bg}>
      <div className="text-center">
        <div
          className="w-8 h-8 flex items-center justify-center mx-auto mb-4"
          style={{ background: "#e8651c" }}
        >
          <span className="text-white text-sm font-bold">C</span>
        </div>
        <p
          className="text-xs uppercase tracking-widest"
          style={{ color: "#9b9488" }}
        >
          Connecting Convex team...
        </p>
      </div>
    </div>
  );
}
