import { startOAuthFlow } from "../lib/auth";

export function SignInForm() {
  return (
    <div
      className="min-h-screen w-full flex items-center justify-center"
      style={{ background: "#e9e6db" }}
    >
      <div
        className="bg-white w-full max-w-xs mx-4 p-8"
        style={{
          border: "2px solid #1a1814",
          boxShadow: "6px 6px 0px #1a1814",
        }}
      >
        <div className="mb-8">
          <div className="flex items-center gap-2.5 mb-4">
            <div
              className="w-7 h-7 flex items-center justify-center"
              style={{ background: "#e8651c" }}
            >
              <span className="text-white text-xs font-bold">C</span>
            </div>
            <h1 className="text-base font-bold tracking-tight uppercase" style={{ color: "#1a1814" }}>
              Convalytics
            </h1>
          </div>
          <p className="text-xs leading-relaxed" style={{ color: "#6b6456" }}>
            Analytics for Convex projects. Sign in to get started.
          </p>
        </div>

        <button
          className="w-full flex items-center justify-center gap-2.5 py-3 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
          style={{
            background: "#1a1814",
            color: "#e9e6db",
            border: "2px solid #1a1814",
          }}
          onMouseEnter={(e) => {
            const el = e.currentTarget;
            el.style.background = "#e8651c";
            el.style.borderColor = "#e8651c";
          }}
          onMouseLeave={(e) => {
            const el = e.currentTarget;
            el.style.background = "#1a1814";
            el.style.borderColor = "#1a1814";
          }}
          onClick={() => void startOAuthFlow()}
        >
          <img
            src="https://www.convex.dev/favicon.ico"
            alt=""
            className="w-4 h-4"
          />
          Sign in with Convex
        </button>

        <p className="text-[11px] mt-5 text-center leading-relaxed" style={{ color: "#9b9488" }}>
          Your Convex projects import automatically.
        </p>
      </div>
    </div>
  );
}
