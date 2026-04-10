// Lightweight User-Agent parser — no dependencies.
// Covers major browsers, OS, and device types for analytics breakdowns.

export interface UAResult {
  browser: string;
  osName: string;
  deviceType: string; // "Desktop" | "Mobile" | "Tablet"
}

export function parseUA(ua: string): UAResult {
  if (!ua) return { browser: "Unknown", osName: "Unknown", deviceType: "Desktop" };

  const browser = parseBrowser(ua);
  const osName = parseOS(ua);
  const deviceType = parseDevice(ua, osName);

  return { browser, osName, deviceType };
}

function parseBrowser(ua: string): string {
  // Order matters — check specific browsers before generic ones
  if (/Edg\//.test(ua)) return "Edge";
  if (/OPR\/|Opera/.test(ua)) return "Opera";
  if (/SamsungBrowser/.test(ua)) return "Samsung Internet";
  if (/UCBrowser/.test(ua)) return "UC Browser";
  if (/Brave/.test(ua)) return "Brave";
  if (/Vivaldi/.test(ua)) return "Vivaldi";
  if (/Firefox\//.test(ua)) return "Firefox";
  if (/CriOS\//.test(ua)) return "Chrome"; // Chrome on iOS
  if (/Chrome\//.test(ua)) return "Chrome";
  if (/Safari\//.test(ua) && /Version\//.test(ua)) return "Safari";
  if (/MSIE|Trident/.test(ua)) return "IE";
  if (/bot|crawl|spider|slurp|googlebot/i.test(ua)) return "Bot";
  return "Other";
}

function parseOS(ua: string): string {
  if (/iPad|iPhone|iPod/.test(ua)) return "iOS";
  if (/Android/.test(ua)) return "Android";
  if (/Windows NT/.test(ua)) return "Windows";
  if (/Mac OS X|Macintosh/.test(ua)) return "macOS";
  if (/CrOS/.test(ua)) return "Chrome OS";
  if (/Linux/.test(ua)) return "Linux";
  return "Other";
}

function parseDevice(ua: string, os: string): string {
  if (/iPad/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua))) return "Tablet";
  if (os === "iOS" || os === "Android" || /Mobile/.test(ua)) return "Mobile";
  return "Desktop";
}
