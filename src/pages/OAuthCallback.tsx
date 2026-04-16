import { useEffect, useRef, useState } from "react";
import { useAction } from "convex/react";
import { useNavigate } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import { clearPkce, getStoredPkce, getReturnTo, setSessionToken } from "../lib/auth";

interface OAuthCallbackProps {
  onSuccess: () => void;
}

export function OAuthCallback({ onSuccess }: OAuthCallbackProps) {
  const exchangeCode = useAction(api.oauth.exchangeCode);
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (ran.current) return;
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
        setError("State mismatch — possible CSRF. Please try signing in again.");
        return;
      }

      const redirectUri = `${window.location.origin}/oauth/callback`;

      try {
        const sessionToken = await exchangeCode({ code, codeVerifier: pkce.verifier, redirectUri });
        clearPkce();
        setSessionToken(sessionToken);
        const returnTo = getReturnTo();
        onSuccess();
        void navigate(returnTo ?? "/", { replace: true });
      } catch (err) {
        clearPkce();
        setError((err as Error).message ?? "Sign-in failed. Please try again.");
      }
    })();
  }, [exchangeCode, onSuccess, navigate]);

  const bg = { background: "#e9e6db" };

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={bg}>
        <div
          className="bg-white w-full max-w-sm mx-4 px-8 py-10 text-center"
          style={{ border: "2px solid #1a1814", boxShadow: "6px 6px 0 #1a1814" }}
        >
          <p className="text-sm font-bold uppercase tracking-wide mb-2" style={{ color: "#1a1814" }}>
            Sign-in failed
          </p>
          <p className="text-xs mb-6 break-all" style={{ color: "#e8651c" }}>{error}</p>
          <a
            href="/"
            className="text-xs uppercase tracking-wider transition-colors"
            style={{ color: "#9b9488" }}
          >
            Back to sign in →
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
        <p className="text-xs uppercase tracking-widest" style={{ color: "#9b9488" }}>
          Signing in...
        </p>
      </div>
    </div>
  );
}
