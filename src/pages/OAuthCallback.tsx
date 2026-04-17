import { useEffect, useRef, useState } from "react";
import { useAction, useConvexAuth } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useNavigate } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import { clearPkce, getStoredPkce, getReturnTo } from "../lib/auth";

export function OAuthCallback() {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const { signIn } = useAuthActions();
  const exchangeCode = useAction(api.oauth.exchangeCode);
  const [error, setError] = useState<string | null>(null);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const ran = useRef(false);
  const navigate = useNavigate();

  useEffect(() => {
    console.log("[OAuthCallback] auth state:", {
      isAuthenticated,
      authLoading,
      ranAlready: ran.current,
    });
    if (ran.current) return;
    // Wait for Convex Auth to hydrate before calling exchangeCode — the
    // action uses requireAuth and would otherwise throw "Not authenticated".
    if (authLoading) return;
    if (!isAuthenticated) {
      // Convex Auth session isn't active. Show a Sign-in button; after
      // signing in, Google will return the user to this same URL (with
      // the `?code=…&state=…` still in it) and the exchange completes.
      setNeedsSignIn(true);
      return;
    }
    ran.current = true;

    void (async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const returnedState = params.get("state");
      const pkce = getStoredPkce();

      if (!code || !returnedState || !pkce) {
        const missing = [
          !code && "code (not in URL)",
          !returnedState && "state (not in URL)",
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
          style={{ border: "2px solid #1a1814", boxShadow: "6px 6px 0 #1a1814" }}
        >
          <p className="text-sm font-bold uppercase tracking-wide mb-2" style={{ color: "#1a1814" }}>
            Connect failed
          </p>
          <p className="text-xs mb-6 break-all" style={{ color: "#e8651c" }}>{error}</p>
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

  if (needsSignIn) {
    // Preserve the entire current URL (pathname + code/state query) as the
    // post-signin redirect target. After Google, we'll land right back here
    // with the OAuth params intact and finish the exchange.
    const redirectTo = `${window.location.pathname}${window.location.search}`;
    return (
      <div className="min-h-screen flex items-center justify-center" style={bg}>
        <div
          className="bg-white w-full max-w-sm mx-4 px-8 py-10 text-center"
          style={{ border: "2px solid #1a1814", boxShadow: "6px 6px 0 #1a1814" }}
        >
          <p className="text-sm font-bold uppercase tracking-wide mb-2" style={{ color: "#1a1814" }}>
            Sign in to finish connecting
          </p>
          <p className="text-xs mb-6" style={{ color: "#6b6456" }}>
            Your Convex team is authorized. Sign in with Google to link it to
            your Convalytics account.
          </p>
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
            onClick={() => void signIn("google", { redirectTo })}
          >
            Sign in with Google
          </button>
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
        <p className="text-xs uppercase tracking-widest" style={{ color: "#9b9488" }}>
          Connecting Convex team...
        </p>
      </div>
    </div>
  );
}
