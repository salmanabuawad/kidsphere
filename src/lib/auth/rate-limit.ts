/**
 * Small in-process fixed-window limiter for login / PIN attempts.
 * Sufficient for a single Node instance; swap for Redis when scaling out.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  b.count++;
  return b.count <= limit;
}

export function resetRateLimit(key: string) {
  buckets.delete(key);
}
