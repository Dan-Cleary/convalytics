const SESSION_KEY = "convalytics_session";
const PKCE_VERIFIER_KEY = "convalytics_pkce_verifier";
const OAUTH_STATE_KEY = "convalytics_oauth_state";
const RETURN_TO_KEY = "convalytics_return_to";

// Session token storage
export function getSessionToken(): string | null {
  return localStorage.getItem(SESSION_KEY);
}

export function setSessionToken(token: string) {
  localStorage.setItem(SESSION_KEY, token);
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

// PKCE helpers
async function generateCodeVerifier(): Promise<string> {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

const CLIENT_ID = "a89dda460f9b4d42";
const AUTHORIZE_URL = "https://dashboard.convex.dev/oauth/authorize/team";

export async function startOAuthFlow(returnTo?: string) {
  const verifier = await generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);
  const state = crypto.randomUUID();

  localStorage.setItem(PKCE_VERIFIER_KEY, verifier);
  localStorage.setItem(OAUTH_STATE_KEY, state);
  if (returnTo) {
    localStorage.setItem(RETURN_TO_KEY, returnTo);
  } else {
    localStorage.removeItem(RETURN_TO_KEY);
  }

  const redirectUri = `${window.location.origin}/oauth/callback`;

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
  });

  window.location.href = `${AUTHORIZE_URL}?${params.toString()}`;
}

export function getStoredPkce(): { verifier: string; state: string } | null {
  const verifier = localStorage.getItem(PKCE_VERIFIER_KEY);
  const state = localStorage.getItem(OAUTH_STATE_KEY);
  if (!verifier || !state) return null;
  return { verifier, state };
}

export function clearPkce() {
  localStorage.removeItem(PKCE_VERIFIER_KEY);
  localStorage.removeItem(OAUTH_STATE_KEY);
}

export function getReturnTo(): string | null {
  const val = localStorage.getItem(RETURN_TO_KEY);
  localStorage.removeItem(RETURN_TO_KEY);
  return val;
}
