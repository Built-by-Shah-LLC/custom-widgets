// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { BootstrapData } from './bootstrap';
import {
  disposeEmbedRuntime,
  getOrCreateEmbedRuntime,
  type EmbedRuntimeOptions,
} from './embed-runtime';

const origin = 'https://widgets.example';
const idOne = '11111111-1111-4111-8111-111111111111';
const idTwo = '22222222-2222-4222-8222-222222222222';

function payload(id: string): BootstrapData {
  return {
    schemaVersion: 1,
    kind: 'before-after',
    config: { id, before_image_url: 'before', after_image_url: 'after' },
  };
}

function setup(options: Partial<EmbedRuntimeOptions> = {}) {
  const data = new Map<string, BootstrapData>([
    [idOne, payload(idOne)],
    [idTwo, payload(idTwo)],
  ]);
  const mounts: Array<{ id: string; root: ShadowRoot; cleanups: number }> = [];
  const loadCalls: string[] = [];
  const cleanupCalls: string[] = [];
  const config: EmbedRuntimeOptions = {
    apiOrigin: origin,
    // Keep the initial global empty so the runtime's origin+ID promise map is
    // exercised; loadBootstrap supplies the validated snapshot.
    getBootstrappedData: () => null,
    loadBootstrap: async (id) => {
      loadCalls.push(id);
      return data.get(id) ?? null;
    },
    hasMatchingBootstrapScript: () => false,
    hasCompletedBlockingBootstrapScript: () => false,
    hasLegacyWidget: () => false,
    prefetchLegacy: () => {},
    mount: ({ widgetId, shadowRoot }) => {
      const entry = { id: widgetId, root: shadowRoot, cleanups: 0 };
      mounts.push(entry);
      return {
        cleanup: () => {
          entry.cleanups += 1;
          cleanupCalls.push(widgetId);
        },
      };
    },
    warn: () => {},
    ...options,
  };
  const runtime = getOrCreateEmbedRuntime(config);
  return { runtime, options: config, data, mounts, loadCalls, cleanupCalls };
}

async function flushMutations() {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await Promise.resolve();
}

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  window.__BBS_WIDGET_EMBED_RUNTIMES__ = undefined;
});

afterEach(() => {
  disposeEmbedRuntime(origin);
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});

describe('EmbedRuntime', () => {
  it('shares one data promise for two placeholders but mounts both nodes', async () => {
    const first = document.createElement('div');
    const second = document.createElement('div');
    first.dataset.bbsEmbed = idOne;
    second.dataset.bbsEmbed = idOne;
    document.body.append(first, second);

    const { loadCalls, mounts } = setup();
    await flushMutations();
    expect(loadCalls).toEqual([idOne]);
    expect(mounts.map((mount) => mount.id)).toEqual([idOne, idOne]);
    expect(first.dataset.bbsMounted).toBe('true');
    expect(second.dataset.bbsMounted).toBe('true');
    expect(first.shadowRoot).not.toBe(second.shadowRoot);
  });

  it('reuses the origin runtime when widget.js is evaluated repeatedly', async () => {
    const placeholder = document.createElement('div');
    placeholder.dataset.bbsEmbed = idOne;
    document.body.append(placeholder);
    const first = setup();
    await flushMutations();
    const second = getOrCreateEmbedRuntime(first.options);
    expect(second).toBe(first.runtime);
    expect(first.mounts).toHaveLength(1);
  });

  it('does not fetch or mount an externally owned marker/root', async () => {
    const placeholder = document.createElement('div');
    placeholder.dataset.bbsEmbed = idOne;
    placeholder.dataset.bbsMounted = 'true';
    placeholder.attachShadow({ mode: 'open' });
    document.body.append(placeholder);
    const loaded: string[] = [];
    const mounted: string[] = [];
    setup({
      loadBootstrap: async (id) => {
        loaded.push(id);
        return payload(id);
      },
      mount: ({ widgetId }) => {
        mounted.push(widgetId);
        return {};
      },
    });
    await flushMutations();
    expect(loaded).toEqual([]);
    expect(mounted).toEqual([]);
  });

  it('cleans up on supported ID removal and remounts an owned root after reinsertion', async () => {
    const placeholder = document.createElement('div');
    placeholder.dataset.bbsEmbed = idOne;
    document.body.append(placeholder);
    const result = setup();
    await flushMutations();
    const ownedRoot = placeholder.shadowRoot;
    expect(ownedRoot).not.toBeNull();

    delete placeholder.dataset.bbsEmbed;
    await flushMutations();
    expect(result.cleanupCalls).toEqual([idOne]);
    expect(placeholder.dataset.bbsMounted).toBeUndefined();
    expect(ownedRoot?.childNodes).toHaveLength(0);

    placeholder.dataset.bbsEmbed = idOne;
    document.body.appendChild(placeholder);
    await flushMutations();
    expect(result.mounts).toHaveLength(2);
    expect(placeholder.shadowRoot).toBe(ownedRoot);
  });

  it('tears down the old ID and mounts the new ID without scanning the document', async () => {
    const placeholder = document.createElement('div');
    placeholder.dataset.bbsEmbed = idOne;
    document.body.append(placeholder);
    const result = setup();
    await flushMutations();

    placeholder.dataset.bbsEmbed = idTwo;
    await flushMutations();
    expect(result.cleanupCalls).toEqual([idOne]);
    expect(result.mounts.map((mount) => mount.id)).toEqual([idOne, idTwo]);
    expect(result.loadCalls).toEqual([idOne, idTwo]);
  });

  it('evicts failed data so a later same-ID placeholder retries', async () => {
    const first = document.createElement('div');
    first.dataset.bbsEmbed = idOne;
    document.body.append(first);
    let calls = 0;
    const result = setup({
      loadBootstrap: async (id) => {
        calls += 1;
        return calls === 1 ? null : payload(id);
      },
    });
    await flushMutations();
    expect(calls).toBe(1);
    expect(result.mounts).toHaveLength(0);

    const later = document.createElement('div');
    later.dataset.bbsEmbed = idOne;
    document.body.append(later);
    await flushMutations();
    expect(calls).toBe(2);
    expect(result.mounts).toHaveLength(1);
  });
});
