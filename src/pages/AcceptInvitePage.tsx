import { useQuery, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { setSessionToken } from "../lib/auth";

interface Props {
  token: string;
  onSuccess: (sessionToken: string) => void;
}

export function AcceptInvitePage({ token, onSuccess }: Props) {
  const invite = useQuery(api.invites.getInviteByToken, { token });
  const acceptInvite = useAction(api.invites.acceptInviteWithPassword);
  const signIn = useAction(api.invites.signInWithPassword);
  const navigate = useNavigate();

  const [mode, setMode] = useState<"accept" | "signin">("accept");

  function switchToSignIn() {
    setMode("signin");
    if (invite?.status === "valid") setEmail(invite.invitedEmail);
  }
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleAccept(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const result = await acceptInvite({
        token,
        password,
        name: name || undefined,
      });
      if ("error" in result && result.error) {
        setError(result.error);
      } else if ("sessionToken" in result && result.sessionToken) {
        saveAndRedirect(result.sessionToken);
      }
    } catch (err) {
      console.error(err);
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await signIn({ email, password });
      if ("error" in result && result.error) {
        setError(result.error);
      } else if ("sessionToken" in result && result.sessionToken) {
        saveAndRedirect(result.sessionToken);
      }
    } catch (err) {
      console.error(err);
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function saveAndRedirect(sessionToken: string) {
    setSessionToken(sessionToken);
    onSuccess(sessionToken);
    void navigate("/overview", { replace: true });
  }

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

          {/* Invite status */}
          {invite === undefined && (
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
            <div>
              <p
                className="text-sm font-bold mb-1"
                style={{ color: "#1a1814" }}
              >
                Already joined
              </p>
              <p className="text-xs mb-5" style={{ color: "#6b6456" }}>
                This invite has already been accepted. Sign in below.
              </p>
              <SignInForm
                email={email}
                password={password}
                error={error}
                loading={loading}
                onEmailChange={setEmail}
                onPasswordChange={setPassword}
                onSubmit={(e) => void handleSignIn(e)}
              />
            </div>
          )}

          {invite?.status === "valid" && mode === "accept" && (
            <div>
              <p
                className="text-sm font-bold mb-1"
                style={{ color: "#1a1814" }}
              >
                You're invited to {invite.teamName}
              </p>
              <p className="text-xs mb-5" style={{ color: "#6b6456" }}>
                Joining as <strong>{invite.invitedEmail}</strong> with role{" "}
                <strong>{invite.role}</strong>. Set a password to get started.
              </p>

              <form
                onSubmit={(e) => void handleAccept(e)}
                className="flex flex-col gap-3"
              >
                <label htmlFor="accept-name" className="sr-only">
                  Your name (optional)
                </label>
                <input
                  id="accept-name"
                  type="text"
                  placeholder="Your name (optional)"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 text-xs outline-none"
                  style={{ border: "1px solid #e0ddd6", color: "#1a1814" }}
                />
                <label htmlFor="accept-password" className="sr-only">
                  Password (min 8 characters)
                </label>
                <input
                  id="accept-password"
                  type="password"
                  placeholder="Password (min 8 characters)"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  className="w-full px-3 py-2 text-xs outline-none"
                  style={{ border: "1px solid #e0ddd6", color: "#1a1814" }}
                />
                <label htmlFor="accept-confirm" className="sr-only">
                  Confirm password
                </label>
                <input
                  id="accept-confirm"
                  type="password"
                  placeholder="Confirm password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  className="w-full px-3 py-2 text-xs outline-none"
                  style={{ border: "1px solid #e0ddd6", color: "#1a1814" }}
                />
                {error && (
                  <p
                    role="alert"
                    className="text-[10px]"
                    style={{ color: "#b94040" }}
                  >
                    {error}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 text-xs font-bold uppercase tracking-wider cursor-pointer disabled:opacity-50"
                  style={{
                    background: "#1a1814",
                    color: "#fff",
                    border: "2px solid #1a1814",
                  }}
                >
                  {loading ? "Setting up…" : "Accept invite"}
                </button>
              </form>

              <p
                className="text-[10px] mt-4 text-center"
                style={{ color: "#9b9488" }}
              >
                Already set a password?{" "}
                <button
                  className="underline cursor-pointer"
                  style={{ color: "#6b6456" }}
                  onClick={switchToSignIn}
                >
                  Sign in instead
                </button>
              </p>
            </div>
          )}

          {invite?.status === "valid" && mode === "signin" && (
            <div>
              <p
                className="text-sm font-bold mb-1"
                style={{ color: "#1a1814" }}
              >
                Sign in to {invite.teamName}
              </p>
              <p className="text-xs mb-5" style={{ color: "#6b6456" }}>
                Use the password you set when you accepted your invite.
              </p>
              <SignInForm
                email={email}
                password={password}
                error={error}
                loading={loading}
                onEmailChange={setEmail}
                onPasswordChange={setPassword}
                onSubmit={(e) => void handleSignIn(e)}
              />
              <p
                className="text-[10px] mt-4 text-center"
                style={{ color: "#9b9488" }}
              >
                <button
                  className="underline cursor-pointer"
                  style={{ color: "#6b6456" }}
                  onClick={() => setMode("accept")}
                >
                  Back to invite
                </button>
              </p>
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

function SignInForm({
  email,
  password,
  error,
  loading,
  onEmailChange,
  onPasswordChange,
  onSubmit,
}: {
  email: string;
  password: string;
  error: string | null;
  loading: boolean;
  onEmailChange: (v: string) => void;
  onPasswordChange: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <label htmlFor="signin-email" className="sr-only">
        Email
      </label>
      <input
        id="signin-email"
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => onEmailChange(e.target.value)}
        required
        className="w-full px-3 py-2 text-xs outline-none"
        style={{ border: "1px solid #e0ddd6", color: "#1a1814" }}
      />
      <label htmlFor="signin-password" className="sr-only">
        Password
      </label>
      <input
        id="signin-password"
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => onPasswordChange(e.target.value)}
        required
        className="w-full px-3 py-2 text-xs outline-none"
        style={{ border: "1px solid #e0ddd6", color: "#1a1814" }}
      />
      {error && (
        <p role="alert" className="text-[10px]" style={{ color: "#b94040" }}>
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={loading}
        className="w-full py-3 text-xs font-bold uppercase tracking-wider cursor-pointer disabled:opacity-50"
        style={{
          background: "#1a1814",
          color: "#fff",
          border: "2px solid #1a1814",
        }}
      >
        {loading ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}