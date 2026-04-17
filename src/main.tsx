import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConvexReactClient } from "convex/react";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import "./index.css";
import App from "./App.tsx";

// ConvexAuthProvider reads `code` from the URL on every mount and removes it
// via history.replaceState. On the /oauth/callback route that code belongs to
// the Convex team OAuth flow, not to Convex Auth. Stash it in sessionStorage
// and strip it from the URL *before* React (and ConvexAuthProvider) mounts so
// ConvexAuth never sees it.
if (window.location.pathname === "/oauth/callback") {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  if (code) {
    sessionStorage.setItem("convex_team_oauth_code", code);
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
