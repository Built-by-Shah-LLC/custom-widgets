export const LIVE_CACHE_LAG_MESSAGE = 'The live site can lag for up to 24h.';

export interface LiveCacheResult {
  fresh: boolean;
  liveCacheWarning?: string;
}

export function laggingCache(): LiveCacheResult {
  return { fresh: false, liveCacheWarning: LIVE_CACHE_LAG_MESSAGE };
}

export function liveCacheWarningOf(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const warning = (value as { liveCacheWarning?: unknown }).liveCacheWarning;
  return typeof warning === 'string' && warning.trim() ? warning : null;
}

export function liveCacheWarningFromText(raw: string): string | null {
  try {
    return liveCacheWarningOf(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function withLiveCacheWarning<T extends object>(
  body: T,
  result: LiveCacheResult
): T {
  if (!result.liveCacheWarning) return body;
  return { ...body, liveCacheWarning: result.liveCacheWarning };
}
