import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({
  supabase: {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: table === 'widgets' ? { id: 'found' } : null,
            error: null,
          }),
        }),
      }),
    }),
  },
}));
vi.mock('@/lib/domain-utils', () => ({
  AllowedDomainsUnavailableError: class extends Error {},
  getAllowedDomains: async () => ['client.example'],
  getRequestOrigin: (request: Request) => request.headers.get('origin') ||
    (request.headers.get('referer') ? new URL(request.headers.get('referer')!).origin : null),
  isOriginAllowed: (origin: string) => origin === 'https://client.example',
}));
vi.mock('@/lib/widget-public-payload', () => ({
  buildReviewsPayload: () => ({ kind: 'reviews', value: 'current' }),
  buildBeforeAfterPayload: vi.fn(),
  buildFormPayload: vi.fn(),
  safeJsString: (value: unknown) => JSON.stringify(value),
}));

import { GET } from './route';

const id = '004a7b18-6bcc-4b2a-a8f9-454012312690';
const url = `https://builtbyshahwidgets.com/api/embeds/widget/${id}/data.js`;
const params = { params: Promise.resolve({ id }) };
const request = (headers: Record<string, string> = {}) => new Request(url, { headers });

describe('data.js conditional responses', () => {
  it('returns a strong body ETag and an empty 304 for an allowed caller', async () => {
    const headers = { Referer: 'https://client.example/main' };
    const first = await GET(request(headers), params);
    const body = await first.text();
    const tag = `"${createHash('sha256').update(body).digest('hex')}"`;
    expect(first.status).toBe(200);
    expect(first.headers.get('etag')).toBe(tag);
    expect(first.headers.get('vary')).toBe('Origin, Referer');

    const second = await GET(request({ ...headers, 'If-None-Match': tag }), params);
    expect(second.status).toBe(304);
    expect(await second.text()).toBe('');
    expect(second.headers.get('etag')).toBe(tag);
    expect(second.headers.get('cache-control')).toBe(first.headers.get('cache-control'));
    expect(second.headers.get('vary')).toBe('Origin, Referer');
  });

  it('keeps headerless requests as uncached 200 responses', async () => {
    const allowed = await GET(request({ Origin: 'https://client.example' }), params);
    const second = await GET(request({ 'If-None-Match': allowed.headers.get('etag')! }), params);
    expect(second.status).toBe(200);
    expect(second.headers.get('cache-control')).toContain('no-store');
    expect(second.headers.has('etag')).toBe(false);
  });

  it('rejects disallowed callers even when they supply a matching ETag', async () => {
    const first = await GET(request({ Origin: 'https://client.example' }), params);
    const blocked = await GET(request({
      Origin: 'https://blocked.example',
      'If-None-Match': first.headers.get('etag')!,
    }), params);
    expect(blocked.status).toBe(403);
  });

  it('serves the full body on a nonmatching ETag', async () => {
    const result = await GET(request({ Origin: 'https://client.example', 'If-None-Match': '"old"' }), params);
    expect(result.status).toBe(200);
    expect(await result.text()).toContain('bbs:widget-data-ready');
  });
});
