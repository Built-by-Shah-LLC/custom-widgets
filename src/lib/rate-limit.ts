const DEFAULT_MAX_ENTRIES = 10_000;

type RateLimiterOptions = {
  windowMs: number;
  maxHits: number;
  maxEntries?: number;
};

export function clientIp(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

/** Bounded, per-instance fixed-window protection for public endpoints. */
export function createRateLimiter({
  windowMs,
  maxHits,
  maxEntries = DEFAULT_MAX_ENTRIES,
}: RateLimiterOptions) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  let nextPruneAt = 0;

  return (key: string, now = Date.now()): boolean => {
    if (now >= nextPruneAt) {
      for (const [storedKey, entry] of hits) {
        if (entry.resetAt <= now) hits.delete(storedKey);
      }
      nextPruneAt = now + windowMs;
    }

    const entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      if (entry) hits.delete(key);
      if (hits.size >= maxEntries) {
        const oldestKey = hits.keys().next().value;
        if (oldestKey !== undefined) hits.delete(oldestKey);
      }
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return false;
    }

    entry.count += 1;
    return entry.count > maxHits;
  };
}
