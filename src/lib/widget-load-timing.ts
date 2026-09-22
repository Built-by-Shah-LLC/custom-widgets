/**
 * Client-side widget load timing beacon. Safe for the embed bundle —
 * no secrets, never blocks mount.
 */

import { isValidWidgetIdString, parseDurationMs } from './widget-timing';

export type WidgetLoadTimingPayload = {
  widgetId: string;
  host: string;
  dataMs: number | null;
  rendererMs: number | null;
  ok: boolean;
};

function clampDuration(ms: number): number | null {
  const rounded = Math.round(ms);
  const parsed = parseDurationMs(rounded);
  return parsed === undefined ? null : parsed;
}

/**
 * Read Resource Timing entries for this widget's data.js and the shared
 * renderer script. Cross-origin durations require Timing-Allow-Origin on
 * those responses.
 */
export function readWidgetResourceDurations(widgetId: string): {
  dataMs: number | null;
  rendererMs: number | null;
} {
  if (
    typeof performance === 'undefined' ||
    typeof performance.getEntriesByType !== 'function'
  ) {
    return { dataMs: null, rendererMs: null };
  }

  const dataNeedle = `/api/embeds/widget/${widgetId}/data.js`;
  let dataMs: number | null = null;
  let rendererMs: number | null = null;

  const entries = performance.getEntriesByType(
    'resource'
  ) as PerformanceResourceTiming[];

  for (const entry of entries) {
    const name = entry.name;
    if (name.includes(dataNeedle)) {
      dataMs = clampDuration(entry.duration);
      continue;
    }

    let pathname = name;
    try {
      pathname = new URL(name).pathname;
    } catch {
      // Keep the raw name for suffix checks.
    }
    if (
      pathname.endsWith('/api/embeds/widget.js') ||
      pathname.endsWith('/widget.js')
    ) {
      rendererMs = clampDuration(entry.duration);
    }
  }

  return { dataMs, rendererMs };
}

function buildPayload(
  widgetId: string,
  ok: boolean
): WidgetLoadTimingPayload | null {
  if (typeof window === 'undefined' || typeof location === 'undefined') {
    return null;
  }
  if (!isValidWidgetIdString(widgetId)) return null;

  const { dataMs, rendererMs } = readWidgetResourceDurations(widgetId);
  return {
    widgetId,
    host: location.hostname,
    dataMs,
    rendererMs,
    ok,
  };
}

/**
 * Fire-and-forget POST. Prefer sendBeacon; fall back to keepalive fetch.
 * Uses text/plain so cross-origin calls stay "simple" (no preflight).
 */
export function sendWidgetLoadTiming(
  apiOrigin: string,
  widgetId: string,
  ok: boolean
): void {
  try {
    const payload = buildPayload(widgetId, ok);
    if (!payload) return;

    const url = `${apiOrigin.replace(/\/$/, '')}/api/v1/widget-timing`;
    const body = JSON.stringify(payload);

    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([body], { type: 'text/plain' });
      if (navigator.sendBeacon(url, blob)) return;
    }

    void fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Diagnostics must never break the embed.
  }
}
