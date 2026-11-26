import { describe, expect, it } from 'vitest';
import { clientIp, createRateLimiter } from './rate-limit';

describe('createRateLimiter', () => {
  it('limits requests until the fixed window expires', () => {
    const rateLimited = createRateLimiter({ windowMs: 1_000, maxHits: 2 });

    expect(rateLimited('client', 0)).toBe(false);
    expect(rateLimited('client', 1)).toBe(false);
    expect(rateLimited('client', 2)).toBe(true);
    expect(rateLimited('client', 1_000)).toBe(false);
  });

  it('evicts the oldest key when the entry cap is reached', () => {
    const rateLimited = createRateLimiter({
      windowMs: 1_000,
      maxHits: 1,
      maxEntries: 2,
    });

    expect(rateLimited('first', 0)).toBe(false);
    expect(rateLimited('second', 1)).toBe(false);
    expect(rateLimited('third', 2)).toBe(false);
    expect(rateLimited('first', 3)).toBe(false);
  });
});

describe('clientIp', () => {
  it('uses the first forwarded address', () => {
    const request = new Request('https://example.com', {
      headers: { 'x-forwarded-for': '203.0.113.4, 10.0.0.1' },
    });

    expect(clientIp(request)).toBe('203.0.113.4');
  });
});
