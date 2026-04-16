// Tiny icon helpers for Pages breakdown cards.
// - Countries: flag emoji from ISO-3166 code
// - Devices: inline monochrome SVG (no brand)
// - Browsers: alrra/browser-logos via jsdelivr — full-color official logos
// - OS: inline multi-color SVGs (Apple, Windows, Linux, Android, Chrome OS)

const ICON_SIZE = 14;

// ── Countries ───────────────────────────────────────────────────────────────

function countryFlag(code: string): string {
  if (!code || code.length !== 2) return "";
  const upper = code.toUpperCase();
  const A = 0x1f1e6;
  const a = "A".charCodeAt(0);
  const c0 = upper.charCodeAt(0);
  const c1 = upper.charCodeAt(1);
  if (c0 < a || c0 > a + 25 || c1 < a || c1 > a + 25) return "";
  return String.fromCodePoint(A + c0 - a, A + c1 - a);
}

export function CountryIcon({ code }: { code: string }) {
  const flag = countryFlag(code);
  if (!flag) return null;
  return <span className="text-sm leading-none flex-shrink-0">{flag}</span>;
}

// ── Devices ─────────────────────────────────────────────────────────────────

export function DeviceIcon({ name }: { name: string }) {
  const stroke = "#1a1814";
  const common = {
    width: ICON_SIZE,
    height: ICON_SIZE,
    fill: "none",
    stroke,
    strokeWidth: 1.4,
  } as const;
  if (name === "Desktop") {
    return (
      <svg viewBox="0 0 16 16" {...common} className="flex-shrink-0">
        <rect x="1.5" y="2.5" width="13" height="8" rx="0.5" />
        <line x1="5" y1="13.5" x2="11" y2="13.5" strokeLinecap="round" />
        <line x1="8" y1="10.5" x2="8" y2="13.5" />
      </svg>
    );
  }
  if (name === "Mobile") {
    return (
      <svg viewBox="0 0 16 16" {...common} className="flex-shrink-0">
        <rect x="4.5" y="1.5" width="7" height="13" rx="1" />
        <line x1="7" y1="12.5" x2="9" y2="12.5" strokeLinecap="round" />
      </svg>
    );
  }
  if (name === "Tablet") {
    return (
      <svg viewBox="0 0 16 16" {...common} className="flex-shrink-0">
        <rect x="2.5" y="1.5" width="11" height="13" rx="1" />
        <line x1="7" y1="12.5" x2="9" y2="12.5" strokeLinecap="round" />
      </svg>
    );
  }
  return null;
}

// ── Browsers (multi-color via jsdelivr CDN) ─────────────────────────────────

const BROWSER_LOGOS: Record<string, string> = {
  Chrome: "chrome",
  Safari: "safari",
  Firefox: "firefox",
  Edge: "edge",
  Opera: "opera",
  Brave: "brave",
  Vivaldi: "vivaldi",
  "Samsung Internet": "samsung-internet",
};

export function BrowserIcon({ name }: { name: string }) {
  const slug = BROWSER_LOGOS[name];
  if (!slug) return null;
  return (
    <img
      src={`https://cdn.jsdelivr.net/gh/alrra/browser-logos/src/${slug}/${slug}.svg`}
      alt=""
      width={ICON_SIZE}
      height={ICON_SIZE}
      loading="lazy"
      className="flex-shrink-0"
      onError={(e) => {
        (e.currentTarget as HTMLImageElement).style.display = "none";
      }}
    />
  );
}

// ── Operating Systems (inline SVG) ──────────────────────────────────────────

export function OSIcon({ name }: { name: string }) {
  switch (name) {
    case "macOS":
    case "iOS":
      return <AppleLogo />;
    case "Windows":
      return <WindowsLogo />;
    case "Linux":
      return <LinuxLogo />;
    case "Android":
      return <AndroidLogo />;
    case "Chrome OS":
      return (
        <img
          src="https://cdn.jsdelivr.net/gh/alrra/browser-logos/src/chrome/chrome.svg"
          alt=""
          width={ICON_SIZE}
          height={ICON_SIZE}
          loading="lazy"
          className="flex-shrink-0"
        />
      );
    default:
      return null;
  }
}

function AppleLogo() {
  // Official Apple silhouette, simplified
  return (
    <svg
      viewBox="0 0 16 16"
      width={ICON_SIZE}
      height={ICON_SIZE}
      fill="#000"
      className="flex-shrink-0"
      aria-hidden="true"
    >
      <path d="M11.18 8.46c-.02-1.97 1.61-2.92 1.68-2.96-.92-1.34-2.34-1.52-2.85-1.54-1.21-.12-2.37.71-2.98.71-.62 0-1.57-.7-2.58-.68-1.33.02-2.56.77-3.24 1.96-1.38 2.4-.35 5.94.99 7.89.66.95 1.44 2.02 2.47 1.98.99-.04 1.37-.64 2.57-.64 1.2 0 1.54.64 2.59.62 1.07-.02 1.75-.97 2.41-1.92.76-1.1 1.07-2.17 1.09-2.22-.02-.01-2.1-.8-2.15-3.2zM9.24 2.76c.55-.66.92-1.59.82-2.51-.79.03-1.75.53-2.32 1.2-.5.58-.95 1.52-.83 2.43.88.07 1.78-.45 2.33-1.12z"/>
    </svg>
  );
}

function WindowsLogo() {
  // Four blue squares, Windows 11 mark
  return (
    <svg
      viewBox="0 0 16 16"
      width={ICON_SIZE}
      height={ICON_SIZE}
      className="flex-shrink-0"
      aria-hidden="true"
    >
      <g fill="#00A4EF">
        <rect x="1" y="1" width="6.2" height="6.2" />
        <rect x="8.8" y="1" width="6.2" height="6.2" />
        <rect x="1" y="8.8" width="6.2" height="6.2" />
        <rect x="8.8" y="8.8" width="6.2" height="6.2" />
      </g>
    </svg>
  );
}

function LinuxLogo() {
  // Stylized Tux silhouette
  return (
    <svg
      viewBox="0 0 16 16"
      width={ICON_SIZE}
      height={ICON_SIZE}
      className="flex-shrink-0"
      aria-hidden="true"
    >
      {/* body (black) */}
      <ellipse cx="8" cy="10.5" rx="4.2" ry="4.3" fill="#000" />
      {/* belly (white) */}
      <ellipse cx="8" cy="11.2" rx="2.5" ry="2.6" fill="#fff" />
      {/* head */}
      <ellipse cx="8" cy="5" rx="2.8" ry="3.2" fill="#000" />
      {/* eye whites */}
      <ellipse cx="6.9" cy="4.5" rx="0.75" ry="0.9" fill="#fff" />
      <ellipse cx="9.1" cy="4.5" rx="0.75" ry="0.9" fill="#fff" />
      {/* pupils */}
      <circle cx="7.1" cy="4.6" r="0.3" fill="#000" />
      <circle cx="8.9" cy="4.6" r="0.3" fill="#000" />
      {/* beak */}
      <path d="M6.7 6.3 L9.3 6.3 L8 7.7 Z" fill="#FCC624" />
      {/* feet */}
      <ellipse cx="6" cy="14.4" rx="1.2" ry="0.6" fill="#FCC624" />
      <ellipse cx="10" cy="14.4" rx="1.2" ry="0.6" fill="#FCC624" />
    </svg>
  );
}

function AndroidLogo() {
  // Green bug-droid head
  return (
    <svg
      viewBox="0 0 16 16"
      width={ICON_SIZE}
      height={ICON_SIZE}
      className="flex-shrink-0"
      aria-hidden="true"
    >
      {/* antennas */}
      <line x1="5" y1="2" x2="6.2" y2="4" stroke="#3DDC84" strokeWidth="0.7" strokeLinecap="round" />
      <line x1="11" y1="2" x2="9.8" y2="4" stroke="#3DDC84" strokeWidth="0.7" strokeLinecap="round" />
      {/* head (half-rounded) */}
      <path d="M2.5 6 Q2.5 3 8 3 Q13.5 3 13.5 6 L13.5 10.5 L2.5 10.5 Z" fill="#3DDC84" />
      {/* eyes */}
      <circle cx="6" cy="6.5" r="0.7" fill="#fff" />
      <circle cx="10" cy="6.5" r="0.7" fill="#fff" />
    </svg>
  );
}
