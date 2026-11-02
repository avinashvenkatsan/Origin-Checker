// Simple in-memory sliding-window limiter. Single-process only; use a shared store if you scale out.
export function createRateLimiter({ limit, windowMs = 60_000, now = () => Date.now() }) {
  const hits = new Map();
  return {
    check(key) {
      const t = now();
      const arr = (hits.get(key) || []).filter((x) => t - x < windowMs);
      if (arr.length >= limit) {
        hits.set(key, arr);
        return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((windowMs - (t - arr[0])) / 1000)) };
      }
      arr.push(t);
      hits.set(key, arr);
      if (hits.size > 10_000) for (const [k, v] of hits) if (!v.some((x) => t - x < windowMs)) hits.delete(k);
      return { allowed: true };
    },
  };
}
