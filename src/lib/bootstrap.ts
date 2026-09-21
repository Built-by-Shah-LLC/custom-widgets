// Client-side bootstrap coordination for widget embeds.
//
// The data.js response is a classic script rather than JSON. It assigns the
// legacy ID-only global so already deployed renderers continue to work, and
// new renderers additionally consume an origin-scoped copy. Every value is
// validated before it reaches a widget component; a malformed or foreign
// value is treated as a cache miss and follows the legacy fallback path.

import type { ApiReview } from './widget-mappers';
import type { BusinessInfo } from './reviews-data';

export const BOOTSTRAP_SCHEMA_VERSION = 1 as const;
export const BOOTSTRAP_READY_EVENT = 'bbs:widget-data-ready';
export const BOOTSTRAP_READY_HOOK = '__BBS_WIDGET_DATA_READY__';
export const ORIGIN_DATA_GLOBAL = '__BBS_WIDGET_DATA_BY_ORIGIN__';

const BOOTSTRAP_TIMEOUT_MS = 10_000;
const MAX_BOOTSTRAP_ATTEMPTS = 2;

export interface BootstrapReviewsData {
  /** Missing on the original route; version 1 is required for new payloads. */
  schemaVersion?: typeof BOOTSTRAP_SCHEMA_VERSION;
  kind: 'reviews';
  /** The public widget row, including config.id and no cached_reviews copy. */
  config: Record<string, unknown>;
  /** Already canonical camelCase business metrics. */
  business: BusinessInfo | null;
  /** Canonical API-shape reviews, included exactly once. */
  reviews: ApiReview[];
}

export interface BootstrapBeforeAfterData {
  schemaVersion?: typeof BOOTSTRAP_SCHEMA_VERSION;
  kind: 'before-after';
  config: Record<string, unknown>;
}

export interface BootstrapFormData {
  schemaVersion?: typeof BOOTSTRAP_SCHEMA_VERSION;
  kind: 'form';
  config: Record<string, unknown>;
  /** Public form payloads use this to reject stale open forms safely. */
  schemaFingerprint?: string;
}

export type BootstrapData =
  | BootstrapReviewsData
  | BootstrapBeforeAfterData
  | BootstrapFormData;

type BootstrapReadyListener = (widgetId: string, origin?: string) => void;

declare global {
  interface Window {
    /** Compatibility global consumed by previously deployed bundles. */
    __BBS_WIDGET_DATA__?: Record<string, unknown>;
    /** Origin-provenanced data used by the current runtime. */
    __BBS_WIDGET_DATA_BY_ORIGIN__?: Record<string, Record<string, unknown>>;
    /** Additive readiness hook emitted by data.js. */
    __BBS_WIDGET_DATA_READY__?: (widgetId: string, origin?: string) => void;
    /** Internal bridge shared by repeated evaluations of widget.js. */
    __BBS_WIDGET_BOOTSTRAP_BRIDGE__?: BootstrapBridge;
  }
}

interface BootstrapBridge {
  listeners: Set<BootstrapReadyListener>;
  previous?: (widgetId: string, origin?: string) => void;
  hook: (widgetId: string, origin?: string) => void;
  eventListener: (event: Event) => void;
}

interface BootstrapScriptInfo {
  scripts: HTMLScriptElement[];
  /** A blocking script without data has already completed before our bundle. */
  hasCompletedBlockingScript: boolean;
}

interface BootstrapPromiseStore {
  promises: Map<string, Promise<BootstrapData | null>>;
  failedScripts: WeakSet<HTMLScriptElement>;
}

let executingBundleScript: HTMLScriptElement | null = null;

/** Capture document.currentScript while the shared IIFE is executing. */
export function setExecutingBundleScript(script: HTMLScriptElement | null): void {
  executingBundleScript = script;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeOrigin(value: string | undefined): string {
  if (!value) {
    if (typeof window === 'undefined') return '';
    return window.location.origin;
  }
  try {
    return new URL(
      value,
      typeof window === 'undefined' ? undefined : window.location.href
    ).origin;
  } catch {
    return value.replace(/\/$/, '');
  }
}

function getRawOriginData(widgetId: string, apiOrigin?: string): unknown {
  if (typeof window === 'undefined') return undefined;
  const origin = normalizeOrigin(apiOrigin);
  const byOrigin = window.__BBS_WIDGET_DATA_BY_ORIGIN__;
  const originData = origin ? byOrigin?.[origin] : undefined;
  if (originData && Object.prototype.hasOwnProperty.call(originData, widgetId)) {
    return originData[widgetId];
  }

  const legacy = window.__BBS_WIDGET_DATA__?.[widgetId];
  if (legacy === undefined) return undefined;

  // An ID-only global is safe for old bundles, but a current bundle running
  // on an external host must prove that the script came from this API origin.
  // A matching data.js tag is the compatibility proof for old server routes.
  if (
    !apiOrigin &&
    !hasBootstrapScriptFromAnotherOrigin(widgetId, origin)
  ) {
    return legacy;
  }
  if (
    apiOrigin &&
    hasMatchingBootstrapScript(widgetId, origin) &&
    !hasBootstrapScriptFromAnotherOrigin(widgetId, origin)
  ) {
    return legacy;
  }
  return undefined;
}

function hasValidSchemaVersion(value: unknown): boolean {
  return value === undefined || value === BOOTSTRAP_SCHEMA_VERSION;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isCanonicalBusiness(value: unknown): value is BusinessInfo {
  if (!isRecord(value)) return false;
  return (
    typeof value.name === 'string' &&
    typeof value.address === 'string' &&
    isFiniteNumber(value.totalReviews) &&
    isFiniteNumber(value.averageRating)
  );
}

function isApiReview(value: unknown): value is ApiReview {
  if (!isRecord(value)) return false;
  if (
    typeof value.id !== 'string' ||
    typeof value.authorName !== 'string' ||
    !isFiniteNumber(value.rating) ||
    typeof value.text !== 'string' ||
    typeof value.relativeTime !== 'string'
  ) {
    return false;
  }
  if (
    value.authorPhotoUrl !== undefined &&
    value.authorPhotoUrl !== null &&
    typeof value.authorPhotoUrl !== 'string'
  ) {
    return false;
  }
  if (
    value.images !== undefined &&
    value.images !== null &&
    (!Array.isArray(value.images) || value.images.some((image) => typeof image !== 'string'))
  ) {
    return false;
  }
  return true;
}

const FORM_FIELD_TYPES = new Set([
  'text',
  'phone',
  'email',
  'textarea',
  'radio',
  'checkbox-group',
  'select',
  'number',
  'date',
  'hidden',
  'static-text',
]);
const VISIBILITY_OPERATORS = new Set([
  'equals',
  'not-equals',
  'contains',
  'selected',
]);

function isVisibilityRule(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    typeof value.field === 'string' &&
    VISIBILITY_OPERATORS.has(String(value.operator)) &&
    typeof value.value === 'string'
  );
}

function isValidation(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.required !== undefined && typeof value.required !== 'boolean') return false;
  if (value.pattern !== undefined && typeof value.pattern !== 'string') return false;
  for (const key of ['minLength', 'maxLength', 'minSelections', 'maxSelections']) {
    if (value[key] !== undefined && !isFiniteNumber(value[key])) return false;
  }
  return true;
}

function isFormConfig(config: Record<string, unknown>): boolean {
  if (!Array.isArray(config.steps) || config.steps.length === 0) return false;
  return config.steps.every((step) => {
    if (!isRecord(step) || typeof step.id !== 'string' || !Array.isArray(step.fields)) {
      return false;
    }
    if (step.heading !== undefined && typeof step.heading !== 'string') return false;
    if (step.description !== undefined && typeof step.description !== 'string') return false;
    if (step.footerNote !== undefined && typeof step.footerNote !== 'string') return false;
    if (step.visibilityRule !== undefined && !isVisibilityRule(step.visibilityRule)) return false;
    if (step.styleOverrides !== undefined && !isRecord(step.styleOverrides)) return false;
    return step.fields.every((field) => {
      if (!isRecord(field) || typeof field.id !== 'string' || !FORM_FIELD_TYPES.has(String(field.type))) {
        return false;
      }
      if (field.label !== undefined && typeof field.label !== 'string') return false;
      if (field.required !== undefined && typeof field.required !== 'boolean') return false;
      if (field.hideLabel !== undefined && typeof field.hideLabel !== 'boolean') return false;
      if (field.placeholder !== undefined && typeof field.placeholder !== 'string') return false;
      if (field.defaultValue !== undefined && typeof field.defaultValue !== 'string') return false;
      if (field.options !== undefined) {
        if (!Array.isArray(field.options)) return false;
        if (
          field.options.some(
            (option) =>
              !isRecord(option) ||
              typeof option.id !== 'string' ||
              typeof option.label !== 'string'
          )
        ) {
          return false;
        }
      }
      if (field.validation !== undefined && !isValidation(field.validation)) return false;
      if (field.visibilityRule !== undefined && !isVisibilityRule(field.visibilityRule)) return false;
      if (field.styleOverrides !== undefined && !isRecord(field.styleOverrides)) return false;
      return true;
    });
  });
}

/**
 * Runtime validation kept separate from window access so malformed payloads
 * can be tested without a browser and so the loader never trusts compile-time
 * interfaces alone.
 */
export function parseBootstrapData(widgetId: string, raw: unknown): BootstrapData | null {
  if (!isRecord(raw) || !hasValidSchemaVersion(raw.schemaVersion)) return null;
  if (raw.kind !== 'reviews' && raw.kind !== 'before-after' && raw.kind !== 'form') {
    return null;
  }
  if (!isRecord(raw.config) || raw.config.id !== widgetId) return null;

  if (raw.kind === 'reviews') {
    // The public DTO uses a canonical camelCase object. Do not run
    // mapBusinessRow here: that helper intentionally reads snake_case DB rows.
    if (
      raw.business !== null &&
      raw.business !== undefined &&
      !isCanonicalBusiness(raw.business)
    ) {
      return null;
    }
    if (
      !Array.isArray(raw.reviews) ||
      raw.reviews.some((review) => !isApiReview(review))
    ) {
      return null;
    }
    const widgetType = raw.config.widget_type;
    if (
      widgetType !== 'google_reviews' &&
      widgetType !== 'google_reviews_carousel'
    ) {
      return null;
    }
    return {
      schemaVersion:
        raw.schemaVersion === BOOTSTRAP_SCHEMA_VERSION
          ? BOOTSTRAP_SCHEMA_VERSION
          : undefined,
      kind: 'reviews',
      config: raw.config,
      business: raw.business === undefined ? null : (raw.business as BusinessInfo | null),
      reviews: raw.reviews as ApiReview[],
    };
  }

  if (raw.kind === 'form') {
    if (!isFormConfig(raw.config)) return null;
    if (
      raw.schemaFingerprint !== undefined &&
      typeof raw.schemaFingerprint !== 'string'
    ) {
      return null;
    }
    return {
      schemaVersion:
        raw.schemaVersion === BOOTSTRAP_SCHEMA_VERSION
          ? BOOTSTRAP_SCHEMA_VERSION
          : undefined,
      kind: 'form',
      config: raw.config,
      ...(typeof raw.schemaFingerprint === 'string'
        ? { schemaFingerprint: raw.schemaFingerprint }
        : {}),
    };
  }

  return {
    schemaVersion:
      raw.schemaVersion === BOOTSTRAP_SCHEMA_VERSION
        ? BOOTSTRAP_SCHEMA_VERSION
        : undefined,
    kind: 'before-after',
    config: raw.config,
  };
}

/** Returns the validated bootstrap payload for this API origin, if present. */
export function getBootstrappedData(
  widgetId: string,
  apiOrigin?: string
): BootstrapData | null {
  return parseBootstrapData(widgetId, getRawOriginData(widgetId, apiOrigin));
}

function matchingScriptOrigin(script: HTMLScriptElement): string | null {
  try {
    return new URL(script.src, document.baseURI).origin;
  } catch {
    return null;
  }
}

function bootstrapPathFor(widgetId: string): string {
  return `/api/embeds/widget/${encodeURIComponent(widgetId)}/data.js`;
}

function scriptMatchesWidget(
  script: HTMLScriptElement,
  widgetId: string,
  apiOrigin: string
): boolean {
  if (matchingScriptOrigin(script) !== normalizeOrigin(apiOrigin)) return false;
  try {
    const url = new URL(script.src, document.baseURI);
    return url.pathname === bootstrapPathFor(widgetId);
  } catch {
    return false;
  }
}

function inspectBootstrapScripts(widgetId: string, apiOrigin: string): BootstrapScriptInfo {
  if (typeof document === 'undefined') {
    return { scripts: [], hasCompletedBlockingScript: false };
  }
  const scripts = Array.from(document.scripts).filter((script) =>
    scriptMatchesWidget(script, widgetId, apiOrigin)
  );
  return {
    scripts,
    // An ordinary parser-blocking tag must have run before a following classic
    // bundle can execute. If it did not assign data, do not hold the widget for
    // the ten-second unknown-stall cap.
    hasCompletedBlockingScript: scripts.some((script) => isCompletedBlockingScript(script)),
  };
}

function isCompletedBlockingScript(script: HTMLScriptElement): boolean {
  if (script.async || script.defer || script.dataset.bbsInjected === 'true') return false;
  // When currentScript is available, only a blocking tag preceding this
  // bundle can have completed: a tag after the async bundle may still be
  // waiting for the parser. The readyState fallback is for unit fixtures and
  // inline evaluation where no executing script element exists.
  const bundleIndex =
    executingBundleScript && typeof document !== 'undefined'
      ? Array.from(document.scripts).indexOf(executingBundleScript)
      : -1;
  const scriptIndex = typeof document !== 'undefined'
    ? Array.from(document.scripts).indexOf(script)
    : -1;
  if (bundleIndex >= 0 && scriptIndex >= 0) return scriptIndex < bundleIndex;
  return typeof document !== 'undefined' && document.readyState !== 'loading';
}

export function hasMatchingBootstrapScript(widgetId: string, apiOrigin: string): boolean {
  return inspectBootstrapScripts(widgetId, apiOrigin).scripts.length > 0;
}

function hasBootstrapScriptFromAnotherOrigin(widgetId: string, apiOrigin: string): boolean {
  if (typeof document === 'undefined') return false;
  const expected = normalizeOrigin(apiOrigin);
  return Array.from(document.scripts).some((script) => {
    let url: URL;
    try {
      url = new URL(script.src, document.baseURI);
    } catch {
      return false;
    }
    if (url.pathname !== bootstrapPathFor(widgetId)) return false;
    return url.origin !== expected;
  });
}

export function hasCompletedBlockingBootstrapScript(
  widgetId: string,
  apiOrigin: string
): boolean {
  return inspectBootstrapScripts(widgetId, apiOrigin).hasCompletedBlockingScript;
}

function ensureBootstrapBridge(): BootstrapBridge | null {
  if (typeof window === 'undefined') return null;
  const existing = window.__BBS_WIDGET_BOOTSTRAP_BRIDGE__;
  if (existing) return existing;

  const listeners = new Set<BootstrapReadyListener>();
  const previous = window[BOOTSTRAP_READY_HOOK];
  const eventListener = (event: Event) => {
    const detail = (event as CustomEvent<{ id?: unknown; origin?: unknown }>).detail;
    if (!isRecord(detail) || typeof detail.id !== 'string') return;
    listeners.forEach((listener) =>
      listener(detail.id as string, typeof detail.origin === 'string' ? detail.origin : undefined)
    );
  };
  const hook = (widgetId: string, origin?: string) => {
    if (typeof previous === 'function') {
      try {
        previous(widgetId, origin);
      } catch {
        // A third-party hook must not break widget readiness.
      }
    }
    listeners.forEach((listener) => listener(widgetId, origin));
  };
  const bridge = { listeners, previous, hook, eventListener };
  window.__BBS_WIDGET_BOOTSTRAP_BRIDGE__ = bridge;
  window[BOOTSTRAP_READY_HOOK] = hook;
  window.addEventListener(BOOTSTRAP_READY_EVENT, eventListener);
  return bridge;
}

/** Registers for additive data.js readiness notifications. */
export function onBootstrapReady(listener: BootstrapReadyListener): () => void {
  const bridge = ensureBootstrapBridge();
  if (!bridge) return () => {};
  bridge.listeners.add(listener);
  return () => bridge.listeners.delete(listener);
}

function getPromiseStore(): BootstrapPromiseStore | null {
  if (typeof window === 'undefined') return null;
  const key = '__BBS_WIDGET_BOOTSTRAP_PROMISES__' as const;
  const w = window as Window & { [key]?: BootstrapPromiseStore };
  if (!w[key]) w[key] = { promises: new Map(), failedScripts: new WeakSet() };
  return w[key] ?? null;
}

function waitForBootstrapAttempt(
  widgetId: string,
  apiOrigin: string,
  attempt: number,
  ignoredScripts: Set<HTMLScriptElement> = new Set()
): Promise<BootstrapData | null> {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return Promise.resolve(null);
  }

  const origin = normalizeOrigin(apiOrigin);
  const inspected = inspectBootstrapScripts(widgetId, origin);
  const existing = getBootstrappedData(widgetId, origin);
  if (existing) return Promise.resolve(existing);
  const store = getPromiseStore();
  // A failed parser-blocking tag is already complete by the time a following
  // bundle runs. For unknown IDs it must be excluded and replaced with one
  // async retry; known IDs are handled by EmbedRuntime's immediate legacy
  // fallback branch before this function is called.
  const scripts = inspected.scripts.filter(
    (script) =>
      !ignoredScripts.has(script) &&
      !store?.failedScripts.has(script) &&
      !isCompletedBlockingScript(script)
  );
  let injected: HTMLScriptElement | null = null;
  if (scripts.length === 0) {
    injected = document.createElement('script');
    injected.async = true;
    injected.dataset.bbsInjected = 'true';
    injected.src = `${origin}${bootstrapPathFor(widgetId)}`;
    (document.head || document.documentElement).appendChild(injected);
    scripts.push(injected);
  }

  return new Promise<BootstrapData | null>((resolve, reject) => {
    let settled = false;
    let finishedScripts = 0;
    const cleanup = () => {
      window.clearTimeout(timer);
      removeReady();
      scripts.forEach((script) => {
        script.removeEventListener('load', onLoad);
        script.removeEventListener('error', onError);
      });
    };
    const finish = (value: BootstrapData | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };
    const finishMiss = () => {
      // Do not leave a failed script in the DOM for a later same-ID caller to
      // adopt as if it were still in flight. Host-supplied tags remain in
      // place; only this request's injected tag is removed.
      if (injected?.isConnected) injected.remove();
      finish(null);
    };
    const onReady = (readyId: string, readyOrigin?: string) => {
      if (readyId !== widgetId) return;
      if (readyOrigin && normalizeOrigin(readyOrigin) !== origin) return;
      const data = getBootstrappedData(widgetId, origin);
      if (data) finish(data);
    };
    const removeReady = onBootstrapReady(onReady);
    const checkAfterListenerRegistration = () => {
      const data = getBootstrappedData(widgetId, origin);
      if (data) finish(data);
    };
    const onLoad = (event: Event) => {
      const data = getBootstrappedData(widgetId, origin);
      if (data) {
        finish(data);
        return;
      }
      if (event.currentTarget instanceof HTMLScriptElement) {
        store?.failedScripts.add(event.currentTarget);
      }
      finishedScripts += 1;
      if (finishedScripts >= scripts.length) finishMiss();
    };
    const onError = (event: Event) => {
      if (event.currentTarget instanceof HTMLScriptElement) {
        store?.failedScripts.add(event.currentTarget);
      }
      finishedScripts += 1;
      if (finishedScripts >= scripts.length) {
        if (attempt < MAX_BOOTSTRAP_ATTEMPTS) {
          cleanup();
          if (injected?.isConnected) injected.remove();
          const nextIgnored = new Set(ignoredScripts);
          scripts.forEach((script) => nextIgnored.add(script));
          waitForBootstrapAttempt(widgetId, origin, attempt + 1, nextIgnored).then(resolve, reject);
        } else {
          finishMiss();
        }
      }
    };

    scripts.forEach((script) => {
      script.addEventListener('load', onLoad);
      script.addEventListener('error', onError);
    });
    const timer = window.setTimeout(() => {
      if (attempt < MAX_BOOTSTRAP_ATTEMPTS) {
        cleanup();
        if (injected?.isConnected) injected.remove();
        const nextIgnored = new Set(ignoredScripts);
        scripts.forEach((script) => nextIgnored.add(script));
        waitForBootstrapAttempt(widgetId, origin, attempt + 1, nextIgnored).then(resolve, reject);
      } else {
        scripts.forEach((script) => store?.failedScripts.add(script));
        finishMiss();
      }
    }, BOOTSTRAP_TIMEOUT_MS);
    // Close the already-completed-script race both before and immediately
    // after listener registration. Assignment-only legacy scripts do not emit
    // the new readiness hook, so the load handler is still required.
    checkAfterListenerRegistration();
    if (settled) return;

  });
}

/**
 * Load a bootstrap script once for an API origin + ID. A repeated widget.js
 * evaluation reuses the global promise store, while a transient injected
 * script failure receives one bounded retry.
 */
export function loadBootstrap(
  widgetId: string,
  apiOrigin: string
): Promise<BootstrapData | null> {
  const origin = normalizeOrigin(apiOrigin);
  const key = `${origin}|${widgetId}`;
  const store = getPromiseStore();
  const existing = store?.promises.get(key);
  if (existing) return existing;

  // If a parser-blocking data tag already completed without producing a
  // valid payload, it has consumed the initial attempt.  Unknown widgets get
  // exactly one fresh async request instead of the failed tag plus two more
  // retries.  A valid payload returns above before this branch is reached.
  const initialAttempt = hasCompletedBlockingBootstrapScript(widgetId, origin)
    ? MAX_BOOTSTRAP_ATTEMPTS
    : 1;
  const request = waitForBootstrapAttempt(widgetId, origin, initialAttempt);
  const promise = request.then(
    (data) => {
      // A null result represents an exhausted miss, not a reusable snapshot.
      // Allow a later placeholder or a reinsertion to make a fresh bounded
      // attempt while retaining successful bootstrap data for the page life.
      if (data === null && store?.promises.get(key) === promise) {
        store.promises.delete(key);
      }
      return data;
    },
    (error) => {
      if (store?.promises.get(key) === promise) store.promises.delete(key);
      throw error;
    }
  );
  store?.promises.set(key, promise);
  return promise;
}

/** Emit the additive hook for synthetic fixtures and alternate data routes. */
export function notifyBootstrapReady(widgetId: string, origin?: string): void {
  if (typeof window === 'undefined') return;
  window[BOOTSTRAP_READY_HOOK]?.(widgetId, origin);
  try {
    window.dispatchEvent(
      new CustomEvent(BOOTSTRAP_READY_EVENT, {
        detail: { id: widgetId, origin: origin ? normalizeOrigin(origin) : undefined },
      })
    );
  } catch {
    // CustomEvent is unavailable in a few older embedded webviews; the hook
    // above remains sufficient for those clients.
  }
}

export function normalizeBootstrapOrigin(value: string): string {
  return normalizeOrigin(value);
}
