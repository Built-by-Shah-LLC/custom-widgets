// @vitest-environment jsdom

import { act, createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  actAndFlush,
  cleanupMounted,
  findButton,
  mount,
  setNativeValue,
  type MountedView,
} from '@/test-utils/react-dom';

const mocks = vi.hoisted(() => ({
  showConfirm: vi.fn(),
  showSaveResult: vi.fn(),
  showToast: vi.fn(),
}));

vi.mock('@/components/ui/ConfirmDialog', () => ({
  showConfirm: mocks.showConfirm,
}));

vi.mock('@/components/ui/Toast', () => ({
  showSaveResult: mocks.showSaveResult,
  showToast: mocks.showToast,
}));

import { SettingsPage } from './SettingsPage';

const mounted: MountedView[] = [];

function renderSettings(initialDomains: Array<{
  id: string;
  domain: string;
  created_at: string;
}> = []) {
  return mount(createElement(SettingsPage, {
    initialDomains,
    recentLoads: [],
  }), mounted);
}

beforeEach(() => {
  mocks.showConfirm.mockReset();
  mocks.showSaveResult.mockReset();
  mocks.showToast.mockReset();
});

afterEach(() => {
  cleanupMounted(mounted);
  vi.unstubAllGlobals();
});

describe('allowed-domain settings', () => {
  it('adds a trimmed domain and shows the server save result', async () => {
    const saved = {
      id: 'domain-1',
      domain: 'dealer.example',
      created_at: '2026-11-10T00:00:00.000Z',
      liveCacheWarning: 'The live site can lag for up to 24h.',
    };
    const fetchMock = vi.fn().mockResolvedValue(Response.json(saved, { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    const container = renderSettings();
    const input = container.querySelector<HTMLInputElement>('input[placeholder="e.g. example.com"]');
    const form = container.querySelector('form');
    if (!input || !form) throw new Error('Add-domain form was not rendered');

    setNativeValue(input, '  dealer.example  ');
    await actAndFlush(() => form.dispatchEvent(new Event('submit', {
      bubbles: true,
      cancelable: true,
    })));

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/allowed-domains', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain: 'dealer.example' }),
    });
    expect(container.textContent).toContain('dealer.example');
    expect(input.value).toBe('');
    expect(mocks.showSaveResult).toHaveBeenCalledWith(saved, 'Domain added');
  });

  it('edits a domain through the rendered controls', async () => {
    const updated = {
      id: 'domain-1',
      domain: 'new-dealer.example',
      created_at: '2026-11-10T00:00:00.000Z',
    };
    const fetchMock = vi.fn().mockResolvedValue(Response.json(updated));
    vi.stubGlobal('fetch', fetchMock);
    const container = renderSettings([{
      id: 'domain-1',
      domain: 'old-dealer.example',
      created_at: '2026-11-09T00:00:00.000Z',
    }]);

    act(() => findButton(container, 'Edit').click());
    const input = Array.from(container.querySelectorAll('input'))
      .find((candidate) => candidate.value === 'old-dealer.example');
    if (!input) throw new Error('Edit-domain input was not rendered');
    setNativeValue(input, ' new-dealer.example ');
    const row = input.closest('li');
    if (!row) throw new Error('Edit-domain row was not rendered');
    await actAndFlush(() => findButton(row, 'Save').click());

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/allowed-domains/domain-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain: 'new-dealer.example' }),
    });
    expect(container.textContent).toContain('new-dealer.example');
    expect(container.textContent).not.toContain('old-dealer.example');
    expect(mocks.showSaveResult).toHaveBeenCalledWith(updated, 'Domain updated');
  });

  it('requires confirmation and prevents duplicate delete requests', async () => {
    let resolveDelete: ((response: Response) => void) | undefined;
    const fetchMock = vi.fn().mockImplementation(() => new Promise<Response>((resolve) => {
      resolveDelete = resolve;
    }));
    vi.stubGlobal('fetch', fetchMock);
    const container = renderSettings([{
      id: 'domain-1',
      domain: 'dealer.example',
      created_at: '2026-11-09T00:00:00.000Z',
    }]);

    act(() => findButton(container, 'Delete').click());
    expect(mocks.showConfirm).toHaveBeenCalledWith(
      'Remove this domain?',
      '“dealer.example” will no longer be allowed to load widget embeds.',
      expect.any(Function),
      { confirmText: 'Remove', cancelText: 'Cancel' }
    );

    const confirm = mocks.showConfirm.mock.calls[0][2] as () => void;
    act(() => {
      confirm();
      confirm();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/allowed-domains/domain-1', {
      method: 'DELETE',
    });

    await act(async () => {
      resolveDelete?.(Response.json({ fresh: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(container.textContent).not.toContain('dealer.example');
    expect(mocks.showSaveResult).toHaveBeenCalledWith({ fresh: true }, 'Domain deleted');
  });
});
