import type { BootstrapData } from './bootstrap';
import { normalizeBootstrapOrigin } from './bootstrap';
import { sendWidgetLoadTiming } from './widget-load-timing';

export const EMBED_SELECTORS = [
  '[data-bbs-embed]',
  '[data-custom-widget]',
  '[data-designdetail-embed]',
] as const;

export type EmbedLifecycle =
  | 'discovered'
  | 'waiting-for-data'
  | 'ready'
  | 'mounting'
  | 'mounted'
  | 'failed';

export interface EmbedMountContext {
  placeholder: HTMLElement;
  widgetId: string;
  apiOrigin: string;
  bootstrap: BootstrapData | null;
  shadowRoot: ShadowRoot;
}

export interface EmbedMountHandle {
  cleanup?: () => void;
}

export interface EmbedRuntimeOptions {
  apiOrigin: string;
  getBootstrappedData: (widgetId: string, apiOrigin: string) => BootstrapData | null;
  loadBootstrap: (widgetId: string, apiOrigin: string) => Promise<BootstrapData | null>;
  hasMatchingBootstrapScript?: (widgetId: string, apiOrigin: string) => boolean;
  hasCompletedBlockingBootstrapScript?: (widgetId: string, apiOrigin: string) => boolean;
  hasLegacyWidget: (widgetId: string) => boolean;
  prefetchLegacy: (widgetId: string, apiOrigin: string) => void;
  mount: (context: EmbedMountContext) => EmbedMountHandle | null | void;
  warn?: (message: string) => void;
}

interface PlaceholderState {
  widgetId: string;
  lifecycle: EmbedLifecycle;
  ownedMarker: boolean;
  shadowRoot?: ShadowRoot;
  cleanup?: () => void;
  /** One timing beacon per placeholder attempt. */
  timingSent?: boolean;
}

interface RuntimeStore {
  runtimes: Map<string, EmbedRuntime>;
}

declare global {
  interface Window {
    __BBS_WIDGET_EMBED_RUNTIMES__?: RuntimeStore;
  }
}

function readWidgetId(placeholder: HTMLElement): string | null {
  return (
    placeholder.dataset.bbsEmbed ||
    placeholder.dataset.customWidget ||
    placeholder.dataset.designdetailEmbed ||
    null
  );
}

function isPlaceholder(element: Element): element is HTMLElement {
  return element instanceof HTMLElement &&
    EMBED_SELECTORS.some((selector) => element.matches(selector));
}

function selectors(): string {
  return EMBED_SELECTORS.join(', ');
}

function isConnected(node: Node): boolean {
  return node.isConnected;
}

/**
 * Coordinates one page's placeholders for one API origin.  The global store
 * makes repeated evaluations of widget.js reuse the same observer, data map,
 * and lifecycle WeakMaps instead of mounting each widget twice.
 */
export class EmbedRuntime {
  readonly apiOrigin: string;

  private readonly options: EmbedRuntimeOptions;
  private readonly states = new WeakMap<HTMLElement, PlaceholderState>();
  private readonly ownedRoots = new WeakMap<HTMLElement, ShadowRoot>();
  private readonly dataPromises = new Map<string, Promise<BootstrapData | null>>();
  private observer: MutationObserver | null = null;
  private started = false;
  private dclListener: (() => void) | null = null;

  constructor(options: EmbedRuntimeOptions) {
    this.options = options;
    this.apiOrigin = normalizeBootstrapOrigin(options.apiOrigin);
  }

  start(): this {
    if (this.started || typeof document === 'undefined') return this;
    this.started = true;

    if (typeof MutationObserver !== 'undefined') {
      this.observer = new MutationObserver((records) => {
        for (const record of records) {
          if (record.type === 'attributes' && record.target instanceof HTMLElement) {
            // Keep processing a node whose last supported ID attribute was
            // removed so its owned root/marker is torn down.
            if (isPlaceholder(record.target) || this.states.has(record.target)) {
              this.processPlaceholder(record.target);
            }
            continue;
          }

          if (record.type !== 'childList') continue;
          record.removedNodes.forEach((node) => this.handleRemovedNode(node));
          record.addedNodes.forEach((node) => this.handleAddedNode(node));
        }
      });
      this.observer.observe(document.documentElement || document, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['data-bbs-embed', 'data-custom-widget', 'data-designdetail-embed'],
      });
    }

    // A startup scan is immediate. DOMContentLoaded is only a recovery pass
    // for placeholders inserted by a parser/deferred host script later on.
    this.scanDocument();
    if (document.readyState === 'loading') {
      this.dclListener = () => this.scanDocument();
      document.addEventListener('DOMContentLoaded', this.dclListener, { once: true });
    }
    return this;
  }

  /** Safe to call when a repeated bundle evaluation reuses this runtime. */
  rescan(): void {
    if (!this.started) this.start();
    else this.scanDocument();
  }

  getState(placeholder: HTMLElement): PlaceholderState | undefined {
    return this.states.get(placeholder);
  }

  dispose(): void {
    this.observer?.disconnect();
    this.observer = null;
    if (this.dclListener && typeof document !== 'undefined') {
      document.removeEventListener('DOMContentLoaded', this.dclListener);
    }
    this.dclListener = null;
    this.started = false;
  }

  private scanDocument(): void {
    if (typeof document === 'undefined') return;
    document.querySelectorAll<HTMLElement>(selectors()).forEach((placeholder) => {
      this.processPlaceholder(placeholder);
    });
  }

  private handleAddedNode(node: Node): void {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const element = node as HTMLElement;
    if (isPlaceholder(element)) this.processPlaceholder(element);
    element.querySelectorAll<HTMLElement>(selectors()).forEach((placeholder) => {
      this.processPlaceholder(placeholder);
    });
  }

  private handleRemovedNode(node: Node): void {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const element = node as HTMLElement;
    const candidates: HTMLElement[] = [];
    if (isPlaceholder(element)) candidates.push(element);
    candidates.push(...element.querySelectorAll<HTMLElement>(selectors()));
    candidates.forEach((placeholder) => {
      // A builder can move a node by remove+insert in one mutation batch. Do
      // not tear it down until we know it did not get reinserted.
      if (!isConnected(placeholder)) this.cleanupPlaceholder(placeholder);
    });
  }

  private processPlaceholder(placeholder: HTMLElement): void {
    const widgetId = readWidgetId(placeholder);
    const current = this.states.get(placeholder);

    if (!widgetId) {
      if (current) this.cleanupPlaceholder(placeholder);
      return;
    }

    if (current && current.widgetId === widgetId) return;
    if (current) this.cleanupPlaceholder(placeholder);

    const state: PlaceholderState = {
      widgetId,
      lifecycle: 'discovered',
      ownedMarker: false,
    };
    this.states.set(placeholder, state);

    const existingRoot = placeholder.shadowRoot;
    const ownedRoot = this.ownedRoots.get(placeholder);
    if (
      (existingRoot && existingRoot !== ownedRoot) ||
      (placeholder.dataset.bbsMounted === 'true' && existingRoot !== ownedRoot)
    ) {
      state.lifecycle = 'failed';
      this.reportTiming(state, false);
      this.warn(`Skipping externally owned widget placeholder ${widgetId}`);
      return;
    }

    const bootstrap = this.options.getBootstrappedData(widgetId, this.apiOrigin);
    if (bootstrap) {
      this.mountWhenReady(placeholder, state, bootstrap);
      return;
    }

    const known = this.options.hasLegacyWidget(widgetId);
    const completedBlockingScript = this.options.hasCompletedBlockingBootstrapScript?.(
      widgetId,
      this.apiOrigin
    ) ?? false;

    // A legacy one-script embed has no data.js tag. Start the bootstrap load
    // for newly-created/unknown IDs, but keep known legacy widgets usable
    // immediately through their existing JSON endpoints. This also avoids
    // waiting ten seconds after a parser-blocking tag has already failed.
    if (known && completedBlockingScript) {
      this.mountLegacy(placeholder, state);
      return;
    }

    state.lifecycle = 'waiting-for-data';
    void this.loadData(widgetId).then(
      (resolved) => {
        if (this.states.get(placeholder) !== state) return;
        if (resolved) {
          this.mountWhenReady(placeholder, state, resolved);
        } else if (known) {
          this.mountLegacy(placeholder, state);
        } else {
          state.lifecycle = 'failed';
          this.reportTiming(state, false);
          this.warn(`No valid bootstrap data for widget ${widgetId}`);
        }
      },
      () => {
        if (this.states.get(placeholder) !== state) return;
        if (known) this.mountLegacy(placeholder, state);
        else {
          state.lifecycle = 'failed';
          this.reportTiming(state, false);
          this.warn(`Failed to load bootstrap data for widget ${widgetId}`);
        }
      }
    );
  }

  private loadData(widgetId: string): Promise<BootstrapData | null> {
    const key = `${this.apiOrigin}|${widgetId}`;
    const existing = this.dataPromises.get(key);
    if (existing) return existing;
    const promise = this.options.loadBootstrap(widgetId, this.apiOrigin);
    this.dataPromises.set(key, promise);
    void promise.then(
      (data) => {
        if (data === null && this.dataPromises.get(key) === promise) {
          this.dataPromises.delete(key);
        }
      },
      () => {
        if (this.dataPromises.get(key) === promise) this.dataPromises.delete(key);
      }
    );
    return promise;
  }

  private mountLegacy(placeholder: HTMLElement, state: PlaceholderState): void {
    if (this.states.get(placeholder) !== state) return;
    try {
      this.options.prefetchLegacy(state.widgetId, this.apiOrigin);
    } catch {
      // The component's own fallback request still has a chance to run.
    }
    this.mountWhenReady(placeholder, state, null);
  }

  private mountWhenReady(
    placeholder: HTMLElement,
    state: PlaceholderState,
    bootstrap: BootstrapData | null
  ): void {
    if (this.states.get(placeholder) !== state) return;
    if (!isConnected(placeholder)) {
      this.cleanupPlaceholder(placeholder);
      return;
    }
    state.lifecycle = 'ready';

    const existingRoot = placeholder.shadowRoot;
    const ownedRoot = this.ownedRoots.get(placeholder);
    const marker = placeholder.dataset.bbsMounted === 'true';

    // A marker or root created by another renderer is external ownership. A
    // current runtime never attaches a second root or unmounts that renderer.
    if ((existingRoot && existingRoot !== ownedRoot) || (marker && existingRoot !== ownedRoot)) {
      state.lifecycle = 'failed';
      this.reportTiming(state, false);
      this.warn(`Skipping externally owned widget placeholder ${state.widgetId}`);
      return;
    }

    // Claim synchronously before attaching a root. An older bundle evaluating
    // later in the same task therefore sees the marker and skips the node.
    placeholder.dataset.bbsMounted = 'true';
    state.ownedMarker = true;
    state.lifecycle = 'mounting';

    let shadowRoot = existingRoot;
    try {
      if (!shadowRoot) {
        shadowRoot = placeholder.attachShadow({ mode: 'open' });
        this.ownedRoots.set(placeholder, shadowRoot);
      } else if (ownedRoot === shadowRoot) {
        shadowRoot.replaceChildren();
      }

      state.shadowRoot = shadowRoot;
      const handle = this.options.mount({
        placeholder,
        widgetId: state.widgetId,
        apiOrigin: this.apiOrigin,
        bootstrap,
        shadowRoot,
      });
      if (!handle) throw new Error('Widget component is unavailable');

      state.cleanup = () => {
        try {
          handle.cleanup?.();
        } finally {
          // ShadowRoot cannot be detached from a host. Clearing it and
          // retaining the WeakMap ownership lets a reinserted node reuse it.
          state.shadowRoot?.replaceChildren();
          if (state.ownedMarker && placeholder.dataset.bbsMounted === 'true') {
            delete placeholder.dataset.bbsMounted;
          }
          state.ownedMarker = false;
        }
      };
      state.lifecycle = 'mounted';
      this.reportTiming(state, true);
    } catch (error) {
      state.lifecycle = 'failed';
      state.shadowRoot?.replaceChildren();
      if (state.ownedMarker && placeholder.dataset.bbsMounted === 'true') {
        delete placeholder.dataset.bbsMounted;
      }
      state.ownedMarker = false;
      this.reportTiming(state, false);
      this.warn(`Failed to mount widget ${state.widgetId}: ${String(error)}`);
    }
  }

  private reportTiming(state: PlaceholderState, ok: boolean): void {
    if (state.timingSent) return;
    state.timingSent = true;
    sendWidgetLoadTiming(this.apiOrigin, state.widgetId, ok);
  }

  private cleanupPlaceholder(placeholder: HTMLElement): void {
    const state = this.states.get(placeholder);
    if (!state) return;
    this.states.delete(placeholder);
    try {
      state.cleanup?.();
    } catch (error) {
      this.warn(`Failed to clean up widget ${state.widgetId}: ${String(error)}`);
    }
  }

  private warn(message: string): void {
    this.options.warn?.(`[custom-widgets] ${message}`);
  }
}

function getRuntimeStore(): RuntimeStore | null {
  if (typeof window === 'undefined') return null;
  window.__BBS_WIDGET_EMBED_RUNTIMES__ ??= { runtimes: new Map() };
  return window.__BBS_WIDGET_EMBED_RUNTIMES__;
}

export function getOrCreateEmbedRuntime(options: EmbedRuntimeOptions): EmbedRuntime {
  const apiOrigin = normalizeBootstrapOrigin(options.apiOrigin);
  const store = getRuntimeStore();
  const existing = store?.runtimes.get(apiOrigin);
  if (existing) {
    existing.rescan();
    return existing;
  }

  const runtime = new EmbedRuntime({ ...options, apiOrigin });
  store?.runtimes.set(apiOrigin, runtime);
  runtime.start();
  return runtime;
}

/** Test/fixture cleanup; production callers intentionally keep the runtime for the page. */
export function disposeEmbedRuntime(apiOrigin: string): void {
  const store = getRuntimeStore();
  const key = normalizeBootstrapOrigin(apiOrigin);
  const runtime = store?.runtimes.get(key);
  runtime?.dispose();
  store?.runtimes.delete(key);
}
