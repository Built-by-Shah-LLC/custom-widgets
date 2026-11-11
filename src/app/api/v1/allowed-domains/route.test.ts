import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LIVE_CACHE_LAG_MESSAGE } from '@/lib/live-cache-warning';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  publishAllEmbedWidgets: vi.fn(),
  requireAdmin: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  supabase: { from: mocks.from },
}));

vi.mock('@/lib/require-admin', () => ({
  requireAdmin: mocks.requireAdmin,
}));

vi.mock('@/lib/widget-publication', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/widget-publication')>()),
  publishAllEmbedWidgets: mocks.publishAllEmbedWidgets,
}));

import { POST } from './route';
import { DELETE, PATCH } from './[id]/route';

function request(method: string, body?: unknown) {
  const path = method === 'POST'
    ? '/api/v1/allowed-domains'
    : '/api/v1/allowed-domains/domain-1';
  return new Request('https://widgets.example' + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const context = { params: Promise.resolve({ id: 'domain-1' }) };

describe('allowed-domain mutation routes', () => {
  beforeEach(() => {
    mocks.from.mockReset();
    mocks.publishAllEmbedWidgets.mockReset();
    mocks.requireAdmin.mockReset();
    mocks.requireAdmin.mockResolvedValue({ error: null });
    mocks.publishAllEmbedWidgets.mockResolvedValue({ fresh: true });
  });

  it('stops an unauthenticated mutation before touching the database', async () => {
    mocks.requireAdmin.mockResolvedValue({
      error: Response.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const response = await POST(request('POST', { domain: 'dealer.example' }));

    expect(response.status).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.publishAllEmbedWidgets).not.toHaveBeenCalled();
  });

  it('normalizes and creates a domain, then exposes a cache publication warning', async () => {
    const saved = {
      id: 'domain-1',
      domain: 'dealer.example',
      created_at: '2026-11-11T00:00:00.000Z',
    };
    const single = vi.fn().mockResolvedValue({ data: saved, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    mocks.from.mockReturnValue({ insert });
    mocks.publishAllEmbedWidgets.mockResolvedValue({
      fresh: false,
      liveCacheWarning: LIVE_CACHE_LAG_MESSAGE,
    });
    const createRequest = request('POST', {
      domain: ' HTTPS://WWW.Dealer.Example/path ',
    });

    const response = await POST(createRequest);

    expect(insert).toHaveBeenCalledWith({ domain: 'dealer.example' });
    expect(mocks.publishAllEmbedWidgets).toHaveBeenCalledWith(createRequest);
    expect(response.status).toBe(201);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(await response.json()).toEqual({
      ...saved,
      liveCacheWarning: LIVE_CACHE_LAG_MESSAGE,
    });
  });

  it('normalizes and updates a domain before publishing the new allowlist', async () => {
    const saved = {
      id: 'domain-1',
      domain: 'new-dealer.example',
      created_at: '2026-11-11T00:00:00.000Z',
    };
    const single = vi.fn().mockResolvedValue({ data: saved, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const eq = vi.fn().mockReturnValue({ select });
    const update = vi.fn().mockReturnValue({ eq });
    mocks.from.mockReturnValue({ update });
    const updateRequest = request('PATCH', {
      domain: 'https://www.new-dealer.example/contact',
    });

    const response = await PATCH(updateRequest, context);

    expect(update).toHaveBeenCalledWith({ domain: 'new-dealer.example' });
    expect(eq).toHaveBeenCalledWith('id', 'domain-1');
    expect(mocks.publishAllEmbedWidgets).toHaveBeenCalledWith(updateRequest);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(saved);
  });

  it('deletes a domain, publishes the new allowlist, and returns an empty success', async () => {
    const select = vi.fn().mockResolvedValue({
      data: [{ id: 'domain-1' }],
      error: null,
    });
    const eq = vi.fn().mockReturnValue({ select });
    const remove = vi.fn().mockReturnValue({ eq });
    mocks.from.mockReturnValue({ delete: remove });
    const deleteRequest = request('DELETE');

    const response = await DELETE(deleteRequest, context);

    expect(eq).toHaveBeenCalledWith('id', 'domain-1');
    expect(select).toHaveBeenCalledWith('id');
    expect(mocks.publishAllEmbedWidgets).toHaveBeenCalledWith(deleteRequest);
    expect(response.status).toBe(204);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(await response.text()).toBe('');
  });
});
