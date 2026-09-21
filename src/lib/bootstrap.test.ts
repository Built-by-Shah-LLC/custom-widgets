// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  BOOTSTRAP_READY_EVENT,
  getBootstrappedData,
  hasCompletedBlockingBootstrapScript,
  loadBootstrap,
  notifyBootstrapReady,
  parseBootstrapData,
  setExecutingBundleScript,
} from './bootstrap';

const id = '11111111-1111-4111-8111-111111111111';
const review = {
  id: 'r1',
  authorName: 'A',
  rating: 5,
  text: 'Great',
  relativeTime: 'today',
  images: [],
};

function reviewsPayload(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    kind: 'reviews',
    config: { id, widget_type: 'google_reviews' },
    business: {
      name: 'Shop',
      address: '123 Main',
      totalReviews: 7,
      averageRating: 4.8,
    },
    reviews: [review],
    ...overrides,
  };
}

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  delete window.__BBS_WIDGET_DATA__;
  delete window.__BBS_WIDGET_DATA_BY_ORIGIN__;
  delete window.__BBS_WIDGET_BOOTSTRAP_BRIDGE__;
  delete window.__BBS_WIDGET_DATA_READY__;
  delete (window as Window & { __BBS_WIDGET_BOOTSTRAP_PROMISES__?: unknown })
    .__BBS_WIDGET_BOOTSTRAP_PROMISES__;
  setExecutingBundleScript(null);
});

afterEach(() => {
  setExecutingBundleScript(null);
});

describe('bootstrap payload validation', () => {
  it('accepts schema 1 and preserves canonical camelCase business metrics', () => {
    const parsed = parseBootstrapData(id, reviewsPayload());
    expect(parsed?.kind).toBe('reviews');
    expect(parsed && parsed.kind === 'reviews' ? parsed.business?.averageRating : null).toBe(4.8);
    expect(parsed && parsed.kind === 'reviews' ? parsed.reviews : []).toHaveLength(1);
  });

  it('accepts the legacy payload with schemaVersion omitted', () => {
    const parsed = parseBootstrapData(id, reviewsPayload({ schemaVersion: undefined }));
    expect(parsed?.kind).toBe('reviews');
    expect(parsed?.schemaVersion).toBeUndefined();
  });

  it('rejects mismatched IDs, unsupported kinds, snake_case business, and malformed reviews', () => {
    expect(parseBootstrapData(id, reviewsPayload({ config: { id: 'other', widget_type: 'google_reviews' } }))).toBeNull();
    expect(parseBootstrapData(id, { ...reviewsPayload(), kind: 'unknown' })).toBeNull();
    expect(
      parseBootstrapData(id, reviewsPayload({ business: { name: 'x', total_reviews: 3, average_rating: 4 } }))
    ).toBeNull();
    expect(parseBootstrapData(id, reviewsPayload({ reviews: [{ ...review, rating: '5' }] }))).toBeNull();
  });

  it('preserves the optional form schema fingerprint', () => {
    const parsed = parseBootstrapData(id, {
      schemaVersion: 1,
      kind: 'form',
      config: { id, steps: [{ id: 's1', fields: [] }] },
      schemaFingerprint: 'abc123',
    });
    expect(parsed).toMatchObject({ kind: 'form', schemaFingerprint: 'abc123' });
  });

  it('rejects a form with malformed step fields before FormWidget can render it', () => {
    const parsed = parseBootstrapData(id, {
      schemaVersion: 1,
      kind: 'form',
      config: { id, steps: [{ id: 's1', heading: 'Contact', fields: null }] },
    });
    expect(parsed).toBeNull();
  });

  it('rejects an empty form and malformed renderer style fields', () => {
    expect(
      parseBootstrapData(id, {
        schemaVersion: 1,
        kind: 'form',
        config: { id, steps: [] },
      })
    ).toBeNull();
    expect(
      parseBootstrapData(id, {
        schemaVersion: 1,
        kind: 'form',
        config: {
          id,
          steps: [{ id: 's1', fields: [], styleOverrides: 'invalid' }],
        },
      })
    ).toBeNull();
  });
});

describe('origin-scoped bootstrap lookup', () => {
  it('accepts the matching API origin and does not cross-use an ID-only value', () => {
    window.__BBS_WIDGET_DATA_BY_ORIGIN__ = {
      'https://api-a.example': { [id]: reviewsPayload() },
      'https://api-b.example': {
        [id]: reviewsPayload({ business: { name: 'B', address: '', totalReviews: 1, averageRating: 1 } }),
      },
    };
    const parsed = getBootstrappedData(id, 'https://api-a.example');
    expect(parsed?.kind).toBe('reviews');
    expect(parsed && parsed.kind === 'reviews' ? parsed.business?.name : null).toBe('Shop');
  });

  it('uses the old ID-only value only when one matching script proves provenance', () => {
    window.__BBS_WIDGET_DATA__ = { [id]: reviewsPayload() };
    const script = document.createElement('script');
    script.src = `https://api-a.example/api/embeds/widget/${id}/data.js`;
    document.head.appendChild(script);
    expect(getBootstrappedData(id, 'https://api-a.example')?.kind).toBe('reviews');

    const foreign = document.createElement('script');
    foreign.src = `https://api-b.example/api/embeds/widget/${id}/data.js`;
    document.head.appendChild(foreign);
    expect(getBootstrappedData(id, 'https://api-a.example')).toBeNull();
  });

  it('recognizes a completed blocking data tag only when it precedes the bundle', () => {
    const dataScript = document.createElement('script');
    dataScript.src = `https://api-a.example/api/embeds/widget/${id}/data.js`;
    document.head.appendChild(dataScript);
    const bundleScript = document.createElement('script');
    bundleScript.src = 'https://api-a.example/api/embeds/widget.js';
    document.head.appendChild(bundleScript);
    setExecutingBundleScript(bundleScript);
    expect(hasCompletedBlockingBootstrapScript(id, 'https://api-a.example')).toBe(true);

    document.body.innerHTML = '';
    document.head.innerHTML = '';
    const pendingBundle = document.createElement('script');
    pendingBundle.src = 'https://api-a.example/api/embeds/widget.js';
    document.head.appendChild(pendingBundle);
    const laterData = document.createElement('script');
    laterData.src = `https://api-a.example/api/embeds/widget/${id}/data.js`;
    document.head.appendChild(laterData);
    setExecutingBundleScript(pendingBundle);
    expect(hasCompletedBlockingBootstrapScript(id, 'https://api-a.example')).toBe(false);
  });
});

describe('bootstrap readiness and bounded script retry', () => {
  it('resolves assignment-only data from the adopted script load event', async () => {
    const script = document.createElement('script');
    script.src = `https://api-a.example/api/embeds/widget/${id}/data.js`;
    script.async = true;
    document.head.appendChild(script);
    const promise = loadBootstrap(id, 'https://api-a.example');
    window.__BBS_WIDGET_DATA__ = { [id]: reviewsPayload() };
    script.dispatchEvent(new Event('load'));
    await expect(promise).resolves.toMatchObject({ kind: 'reviews' });
  });

  it('resolves from the additive event even when the script has no load notification', async () => {
    const promise = loadBootstrap(id, 'https://api-a.example');
    window.__BBS_WIDGET_DATA_BY_ORIGIN__ = {
      'https://api-a.example': { [id]: reviewsPayload() },
    };
    window.dispatchEvent(
      new CustomEvent(BOOTSTRAP_READY_EVENT, {
        detail: { id, origin: 'https://api-a.example' },
      })
    );
    await expect(promise).resolves.toMatchObject({ kind: 'reviews' });
    notifyBootstrapReady(id, 'https://api-a.example');
  });

  it('does not re-adopt an errored script on its bounded retry', async () => {
    const promise = loadBootstrap(id, 'https://api-a.example');
    const first = document.querySelector<HTMLScriptElement>('script[data-bbs-injected="true"]');
    expect(first).not.toBeNull();
    first?.dispatchEvent(new Event('error'));
    const second = Array.from(document.scripts).find((script) => script !== first) as HTMLScriptElement | undefined;
    expect(second).toBeDefined();
    second?.dispatchEvent(new Event('error'));
    await expect(promise).resolves.toBeNull();
  });

  it('evicts an exhausted miss so a later caller gets a fresh request', async () => {
    const promise = loadBootstrap(id, 'https://api-a.example');
    const first = document.querySelector<HTMLScriptElement>('script[data-bbs-injected="true"]');
    expect(first).not.toBeNull();
    first?.dispatchEvent(new Event('error'));
    const retry = Array.from(document.scripts).find((script) => script !== first) as HTMLScriptElement | undefined;
    expect(retry).toBeDefined();
    retry?.dispatchEvent(new Event('error'));
    await expect(promise).resolves.toBeNull();

    const later = loadBootstrap(id, 'https://api-a.example');
    const fresh = Array.from(document.scripts).filter(
      (script) => script.dataset.bbsInjected === 'true'
    );
    expect(fresh).toHaveLength(1);
    expect(fresh[0]).not.toBe(first);
    fresh[0]?.dispatchEvent(new Event('error'));
    const freshRetry = Array.from(document.scripts).find(
      (script) => script !== fresh[0] && script.dataset.bbsInjected === 'true'
    ) as HTMLScriptElement | undefined;
    freshRetry?.dispatchEvent(new Event('error'));
    await expect(later).resolves.toBeNull();
  });

  it('does not re-adopt a host async tag known to have failed', async () => {
    const hostScript = document.createElement('script');
    hostScript.async = true;
    hostScript.src = `https://api-a.example/api/embeds/widget/${id}/data.js`;
    document.head.appendChild(hostScript);

    const first = loadBootstrap(id, 'https://api-a.example');
    hostScript.dispatchEvent(new Event('error'));
    const retry = document.querySelector<HTMLScriptElement>('script[data-bbs-injected="true"]');
    expect(retry).not.toBeNull();
    retry?.dispatchEvent(new Event('error'));
    await expect(first).resolves.toBeNull();

    const later = loadBootstrap(id, 'https://api-a.example');
    const fresh = document.querySelector<HTMLScriptElement>('script[data-bbs-injected="true"]');
    expect(fresh).not.toBeNull();
    expect(fresh).not.toBe(hostScript);
    fresh?.dispatchEvent(new Event('error'));
    const finalRetry = document.querySelector<HTMLScriptElement>('script[data-bbs-injected="true"]');
    finalRetry?.dispatchEvent(new Event('error'));
    await expect(later).resolves.toBeNull();
  });

  it('replaces a completed failed blocking tag for an unknown ID', async () => {
    const unknownId = '33333333-3333-4333-8333-333333333333';
    const dataScript = document.createElement('script');
    dataScript.src = `https://api-a.example/api/embeds/widget/${unknownId}/data.js`;
    document.head.appendChild(dataScript);
    const bundleScript = document.createElement('script');
    bundleScript.src = 'https://api-a.example/api/embeds/widget.js';
    document.head.appendChild(bundleScript);
    setExecutingBundleScript(bundleScript);

    const promise = loadBootstrap(unknownId, 'https://api-a.example');
    const retry = Array.from(document.scripts).find((script) => script !== dataScript && script !== bundleScript) as HTMLScriptElement | undefined;
    expect(retry).toBeDefined();
    window.__BBS_WIDGET_DATA_BY_ORIGIN__ = {
      'https://api-a.example': {
        [unknownId]: {
          schemaVersion: 1,
          kind: 'before-after',
          config: { id: unknownId },
        },
      },
    };
    retry?.dispatchEvent(new Event('load'));
    await expect(promise).resolves.toMatchObject({ kind: 'before-after' });
  });

  it('uses one fresh request after a completed blocking failure', async () => {
    const unknownId = '44444444-4444-4444-8444-444444444444';
    const dataScript = document.createElement('script');
    dataScript.src = `https://api-a.example/api/embeds/widget/${unknownId}/data.js`;
    document.head.appendChild(dataScript);
    const bundleScript = document.createElement('script');
    bundleScript.src = 'https://api-a.example/api/embeds/widget.js';
    document.head.appendChild(bundleScript);
    setExecutingBundleScript(bundleScript);

    const promise = loadBootstrap(unknownId, 'https://api-a.example');
    const injected = Array.from(document.scripts).filter(
      (script) => script.dataset.bbsInjected === 'true'
    );
    expect(injected).toHaveLength(1);
    injected[0]?.dispatchEvent(new Event('error'));

    await expect(promise).resolves.toBeNull();
    expect(
      Array.from(document.scripts).filter(
        (script) => script.dataset.bbsInjected === 'true'
      )
    ).toHaveLength(0);
  });
});
