/**
 * Shared validation / scoring for widget load timing beacons.
 * Kept free of Supabase so unit tests stay offline.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_DURATION_MS = 60_000;

/** Bare hostname only — no scheme, path, port, query, or whitespace. */
export function parseTimingHost(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const host = value.trim().toLowerCase();
  if (!host || host.length > 253) return null;
  // location.hostname never includes scheme/path/port; reject those shapes.
  if (/[/:?#\s]/.test(host)) return null;
  return host;
}

export function isValidWidgetId(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

/** null, or a finite integer in 0..60000 inclusive. */
export function parseDurationMs(value: unknown): number | null | undefined {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isInteger(value)) return undefined;
  if (value < 0 || value > MAX_DURATION_MS) return undefined;
  return value;
}

export function parseOk(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

/**
 * Which script was slower. Null when either duration is missing
 * (e.g. legacy embeds without data.js).
 */
export function computeSlower(
  dataMs: number | null,
  rendererMs: number | null
): 'data' | 'renderer' | null {
  if (dataMs === null || rendererMs === null) return null;
  return dataMs >= rendererMs ? 'data' : 'renderer';
}

export function isValidWidgetIdString(id: string): boolean {
  return UUID_RE.test(id);
}
