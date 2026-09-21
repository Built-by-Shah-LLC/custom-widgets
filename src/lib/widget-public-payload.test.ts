import { describe, expect, it } from 'vitest';
import {
  buildFormPayload,
  buildReviewsPayload,
  publicFormResponse,
  safeJsString,
} from './widget-public-payload';

describe('public widget payloads', () => {
  it('maps business metrics once and emits reviews only at the canonical top level', () => {
    const payload = buildReviewsPayload({
      id: 'widget-1',
      cached_reviews: [
        {
          id: 'review-1',
          authorName: 'Ada',
          rating: 5,
          text: 'Great',
          relativeTime: 'today',
        },
      ],
      businesses: {
        name: 'Shop',
        address: '1 Main',
        total_reviews: 321,
        average_rating: 4.7,
      },
      star_color: '#f00',
    });

    expect(payload.schemaVersion).toBe(1);
    expect(payload.business).toMatchObject({ totalReviews: 321, averageRating: 4.7 });
    expect(payload.reviews).toHaveLength(1);
    expect(payload.config).toMatchObject({ id: 'widget-1', star_color: '#f00' });
    expect(payload.config).not.toHaveProperty('cached_reviews');
    expect(payload.config).not.toHaveProperty('businesses');

    const withoutBusiness = buildReviewsPayload({ id: 'widget-2', cached_reviews: [] });
    expect(withoutBusiness).not.toHaveProperty('business');
  });

  it('strips form delivery/storage settings from every public response shape', () => {
    const row = {
      id: 'form-1',
      name: 'Public form',
      steps: [],
      submit_webhook_url: 'https://private.example/webhook',
      submit_email: 'private@example.com',
      store_submissions: false,
      honeypot_enabled: true,
      success_message: 'Thanks',
    };
    const payload = buildFormPayload(row);
    const response = publicFormResponse(row);

    for (const value of [payload.config, response]) {
      expect(value).not.toHaveProperty('submit_webhook_url');
      expect(value).not.toHaveProperty('submit_email');
      expect(value).not.toHaveProperty('store_submissions');
    }
    expect(payload.schemaFingerprint).toMatch(/^[0-9a-f]{16}$/);
    expect(response.schemaFingerprint).toBe(payload.schemaFingerprint);
  });

  it('escapes script delimiters and line separators', () => {
    const serialized = safeJsString({ value: '</script>\u2028\u2029' });
    expect(serialized).toContain('\\u003c/script>');
    expect(serialized).toContain('\\u2028');
    expect(serialized).toContain('\\u2029');
  });
});
