import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConvexReactClient } from "convex/react";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import "./index.css";
import App from "./App.tsx";

// ConvexAuthProvider reads OAuth params from the URL on every mount and can
// remove them via history.replaceState. On the /oauth/callback route these
// `code`/`state` values belong to the Convex team OAuth flow, not Convex Auth.
// Stash them in sessionStorage and strip them from the URL *before* React (and
// ConvexAuthProvider) mounts so ConvexAuth never sees them.
if (window.location.pathname === "/oauth/callback") {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const state = params.get("state");
  if (code || state) {
    if (code) {
      sessionStorage.setItem("convex_team_oauth_code", code);
    }
    if (state) {
      sessionStorage.setItem("convex_team_oauth_state", state);
    }
    params.delete("state");
    params.delete("code");
    const newUrl =
      window.location.pathname +
      (params.toString() ? "?" + params.toString() : "");
    window.history.replaceState({}, "", newUrl);
  }
}

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ConvexAuthProvider client={convex}>
      <App />
    </ConvexAuthProvider>
  </StrictMode>,
);
