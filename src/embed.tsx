import { createRoot } from 'react-dom/client';
import {
  getBootstrappedWidgetComponent,
  getWidgetComponent,
  getWidgetKind,
} from './widget-registry';
import {
  getBeforeAfterWidget,
  getFormWidget,
  getWidgetConfig,
  getWidgetReviews,
} from './lib/prefetch';
import {
  getBootstrappedData,
  hasCompletedBlockingBootstrapScript,
  hasMatchingBootstrapScript,
  loadBootstrap,
  normalizeBootstrapOrigin,
  setExecutingBundleScript,
} from './lib/bootstrap';
import {
  getOrCreateEmbedRuntime,
  type EmbedMountContext,
} from './lib/embed-runtime';
import { ErrorBoundary } from './components/ErrorBoundary';
import widgetStyles from './styles/widget.css?inline';

// Capture currentScript while this classic IIFE is evaluating. It is used to
// distinguish a completed parser-blocking legacy bootstrap tag before this
// bundle from a blocking tag that appears later and is still pending.
const executingScript =
  typeof document !== 'undefined'
    ? (document.currentScript as HTMLScriptElement | null)
    : null;
setExecutingBundleScript(executingScript);

// Resolve the API origin at script-eval time: the page is on an external
// domain (GHL etc.), so API calls must go to wherever widget.js was loaded
// from. The override is useful for isolated fixtures.
const SCRIPT_ORIGIN = (() => {
  const w = window as unknown as { __CUSTOM_WIDGETS_API_ORIGIN__?: string };
  if (w.__CUSTOM_WIDGETS_API_ORIGIN__) {
    return normalizeBootstrapOrigin(w.__CUSTOM_WIDGETS_API_ORIGIN__);
  }
  try {
    const src = executingScript?.src;
    if (src) return normalizeBootstrapOrigin(new URL(src, document.baseURI).origin);
  } catch {
    // fall through to the page origin
  }
  return normalizeBootstrapOrigin(window.location.origin);
})();

function prefetchLegacyWidgetData(widgetId: string, apiOrigin: string): void {
  if (getBootstrappedData(widgetId, apiOrigin)) return;

  const kind = getWidgetKind(widgetId);
  if (!kind) return;

  if (kind === 'before-after') {
    void getBeforeAfterWidget(widgetId, apiOrigin).catch(() => {});
    return;
  }

  if (kind === 'form') {
    void getFormWidget(widgetId, apiOrigin).catch(() => {});
    return;
  }

  // Reviews and carousel both need config + reviews. The prefetch module's
  // origin-scoped promise map means separate placeholders share each request.
  void getWidgetConfig(widgetId, apiOrigin).catch(() => {});
  void getWidgetReviews(widgetId, apiOrigin).catch(() => {});
}

function mountWidget({
  widgetId,
  apiOrigin,
  bootstrap,
  shadowRoot,
}: EmbedMountContext) {
  // Bootstrap kind is authoritative. Registry lookup is retained only for
  // old one-script embeds that have no valid bootstrap payload.
  const Widget = bootstrap
    ? getBootstrappedWidgetComponent(bootstrap)
    : getWidgetComponent(widgetId);
  if (!Widget) return null;

  const styleEl = document.createElement('style');
  styleEl.textContent = widgetStyles;
  shadowRoot.appendChild(styleEl);

  const mountPoint = document.createElement('div');
  mountPoint.className = 'custom-widget-root';
  shadowRoot.appendChild(mountPoint);

  const root = createRoot(mountPoint);
  root.render(
    <ErrorBoundary
      scope={`embed:${widgetId}`}
      apiOrigin={apiOrigin}
      fallback={null}
    >
      <Widget
        widgetId={widgetId}
        apiOrigin={apiOrigin}
        bootstrap={bootstrap ?? undefined}
      />
    </ErrorBoundary>
  );

  return {
    cleanup: () => root.unmount(),
  };
}

getOrCreateEmbedRuntime({
  apiOrigin: SCRIPT_ORIGIN,
  getBootstrappedData,
  loadBootstrap,
  hasMatchingBootstrapScript,
  hasCompletedBlockingBootstrapScript,
  hasLegacyWidget: (widgetId) => Boolean(getWidgetComponent(widgetId)),
  prefetchLegacy: prefetchLegacyWidgetData,
  mount: mountWidget,
  warn: (message) => console.warn(message),
});
