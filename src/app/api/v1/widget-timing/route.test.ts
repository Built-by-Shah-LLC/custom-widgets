import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  allowedSelect: vi.fn(),
  insert: vi.fn(),
  from: vi.fn(),
  rateLimited: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  supabase: { from: mocks.from },
}));

vi.mock('@/lib/rate-limit', () => ({
  clientIp: () => '203.0.113.8',
  createRateLimiter: () => mocks.rateLimited,
}));

import { POST } from './route';

const WIDGET_ID = '11111111-1111-4111-8111-111111111111';

function request(body: unknown, origin = 'https://dealer.example') {
  return new Request('https://widgets.example/api/v1/widget-timing', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: origin,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function validBody() {
  return {
    widgetId: WIDGET_ID,
    host: 'dealer.example',
    dataMs: 75,
    rendererMs: 125,
    ok: true,
  };
}

describe('widget timing intake route', () => {
  beforeEach(() => {
    mocks.rateLimited.mockReturnValue(false);
    mocks.allowedSelect.mockResolvedValue({
      data: [{ domain: 'dealer.example' }],
      error: null,
    });
    mocks.insert.mockResolvedValue({ error: null });
    mocks.from.mockImplementation((table: string) => {
      if (table === 'allowed_domains') return { select: mocks.allowedSelect };
      if (table === 'widget_load_timings') return { insert: mocks.insert };
      throw new Error('Unexpected Supabase table: ' + table);
    });
  });

  it('rate-limits before parsing or querying the access policy', async () => {
    mocks.rateLimited.mockReturnValue(true);

    const response = await POST(request('{not-json'));

    expect(response.status).toBe(429);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(await response.json()).toEqual({ error: 'Too many requests' });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('rejects malformed JSON and invalid timing fields', async () => {
    const malformed = await POST(request('{not-json'));
    const invalid = await POST(request({ ...validBody(), dataMs: 60_001 }));

    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toEqual({ error: 'Invalid JSON' });
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({ error: 'Invalid input' });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('fails closed when the allowed-domain policy cannot be loaded', async () => {
    mocks.allowedSelect.mockResolvedValue({
      data: null,
      error: { message: 'database unavailable' },
    });

    const response = await POST(request(validBody()));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: 'Widget access policy unavailable',
    });
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('rejects a posted host that does not match the allowlisted caller', async () => {
    const response = await POST(request(validBody(), 'https://evil.example'));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Host not allowed' });
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('stores an allowlisted timing sample and reports the slower resource', async () => {
    const response = await POST(request(validBody()));

    expect(response.status).toBe(204);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(await response.text()).toBe('');
    expect(mocks.insert).toHaveBeenCalledWith({
      widget_id: WIDGET_ID,
      host: 'dealer.example',
      data_ms: 75,
      renderer_ms: 125,
      ok: true,
      slower: 'renderer',
    });
  });

  it('returns a no-store server error when persistence fails', async () => {
    mocks.insert.mockResolvedValue({ error: { message: 'write failed' } });

    const response = await POST(request(validBody()));

    expect(response.status).toBe(500);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(await response.json()).toEqual({ error: 'Failed to store timing' });
  });
});
