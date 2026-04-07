type WithEnv = { environment?: string };

export function filterByEnv<T extends WithEnv>(
  rows: T[],
  environment?: string,
): T[] {
  if (!environment) return rows;
  return rows.filter((r) => r.environment === environment);
}
