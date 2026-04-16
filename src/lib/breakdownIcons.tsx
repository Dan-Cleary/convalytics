// Tiny icon helpers for Pages breakdown cards.
// - Countries: flag emoji from ISO-3166 code
// - Devices: inline SVG (no brand)
// - Browsers / OS: Simple Icons CDN in brand colors, consistent with the
//   favicon CDN already used for referrers.

// ISO-3166 alpha-2 → flag emoji (regional indicator symbols)
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

// Browser name → Simple Icons slug
const BROWSER_SLUGS: Record<string, string> = {
  Chrome: "googlechrome",
  Safari: "safari",
  Firefox: "firefox",
  Edge: "microsoftedge",
  Opera: "opera",
  Brave: "brave",
  Vivaldi: "vivaldi",
  "Samsung Internet": "samsung",
  IE: "internetexplorer",
};

const OS_SLUGS: Record<string, string> = {
  macOS: "apple",
  iOS: "apple",
  Windows: "windows11",
  Linux: "linux",
  Android: "android",
  "Chrome OS": "googlechrome",
};

function BrandIcon({ slug }: { slug: string | undefined }) {
  if (!slug) return null;
  return (
    <img
      src={`https://cdn.simpleicons.org/${slug}`}
      alt=""
      width={12}
      height={12}
      loading="lazy"
      className="flex-shrink-0"
      onError={(e) => {
        (e.currentTarget as HTMLImageElement).style.display = "none";
      }}
    />
  );
}

export function BrowserIcon({ name }: { name: string }) {
  return <BrandIcon slug={BROWSER_SLUGS[name]} />;
}

export function OSIcon({ name }: { name: string }) {
  return <BrandIcon slug={OS_SLUGS[name]} />;
}

export function DeviceIcon({ name }: { name: string }) {
  const stroke = "#1a1814";
  const common = { width: 12, height: 12, fill: "none", stroke, strokeWidth: 1.5 } as const;
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
