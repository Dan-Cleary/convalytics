/**
 * Centralized hex-encoded sha-256 for every reveal-once token path (team
 * invites, API tokens, future webhook signatures). Having one implementation
 * means we can swap algorithms (HKDF, per-deployment pepper, etc.) without
 * hunting for copies.
 */
export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
