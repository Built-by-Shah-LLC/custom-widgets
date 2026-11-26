import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  clientIp: vi.fn(),
  rateLimited: vi.fn(),
  requireAdmin: vi.fn(),
  reportCritical: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  clientIp: mocks.clientIp,
  createRateLimiter: () => mocks.rateLimited,
}));

vi.mock('@/lib/require-admin', () => ({
  requireAdmin: mocks.requireAdmin,
}));

vi.mock('@/lib/alerts', () => ({
  reportCritical: mocks.reportCritical,
}));

import { POST } from './route';

function request(body: unknown, headers?: HeadersInit) {
  return new Request('https://widgets.example/api/v1/alerts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('critical alert intake route', () => {
  beforeEach(() => {
    mocks.clientIp.mockReturnValue('203.0.113.7');
    mocks.rateLimited.mockReturnValue(false);
    mocks.requireAdmin.mockResolvedValue({
      error: Response.json({ error: 'Unauthorized' }, { status: 401 }),
    });
    mocks.reportCritical.mockResolvedValue({ sent: true });
  });

  it('rate-limits a public caller before parsing or sending an alert', async () => {
    mocks.rateLimited.mockReturnValue(true);

    const response = await POST(request('{not-json'));

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: 'Too many requests' });
    expect(mocks.reportCritical).not.toHaveBeenCalled();
  });

  it('rejects malformed JSON and incomplete alerts', async () => {
    const malformed = await POST(request('{not-json'));
    const missingMessage = await POST(request({ title: 'Outage' }));

    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toEqual({ error: 'Invalid JSON' });
    expect(missingMessage.status).toBe(400);
    expect(await missingMessage.json()).toEqual({
      error: 'title and message are required',
    });
    expect(mocks.reportCritical).not.toHaveBeenCalled();
  });

  it('prevents public callers from downgrading alert severity', async () => {
    const response = await POST(request({
      title: 'Renderer failed',
      message: 'The widget could not mount',
      severity: 'warning',
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Invalid severity' });
    expect(mocks.reportCritical).not.toHaveBeenCalled();
  });

  it('accepts a valid public alert and overwrites untrusted source metadata', async () => {
    const response = await POST(request({
      title: '  Renderer failed  ',
      message: '  The widget could not mount  ',
      fingerprint: 'x'.repeat(130),
      meta: {
        widgetId: 'widget-1',
        source: 'admin-client',
        ip: '127.0.0.1',
      },
    }));

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ sent: true });
    expect(mocks.reportCritical).toHaveBeenCalledWith({
      title: 'Renderer failed',
      message: 'The widget could not mount',
      fingerprint: 'x'.repeat(120),
      meta: {
        widgetId: 'widget-1',
        source: 'public-client',
        ip: '203.0.113.7',
      },
    });
  });

  it('lets an authenticated admin bypass the public rate limit', async () => {
    mocks.requireAdmin.mockResolvedValue({ error: null });
    mocks.rateLimited.mockReturnValue(true);

    const response = await POST(request({
      title: 'Admin diagnostic',
      message: 'Manual alert',
      severity: 'warning',
    }));

    expect(response.status).toBe(202);
    expect(mocks.reportCritical).toHaveBeenCalledWith(expect.objectContaining({
      meta: expect.objectContaining({ source: 'admin-client' }),
    }));
  });
});
