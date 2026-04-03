// Derives the Convex HTTP site URL from VITE_CONVEX_URL
// e.g. https://xxx.convex.cloud → https://xxx.convex.site
export function getConvexSiteUrl(): string {
  const url = import.meta.env.VITE_CONVEX_URL as string;
  return url.replace(/\.convex\.cloud$/, ".convex.site");
}
