import { describe, expect, it } from 'vitest';
import {
  buildFormPayload,
  buildReviewsPayload,
  publicFormResponse,
  publicReviewList,
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

  it('sends only the reviews that survive the widget filters and maxReviews', () => {
    const reviews = [
      { id: 'low', authorName: 'A', rating: 3, text: 'Ok', relativeTime: '1 day ago' },
      { id: 'no-photo', authorName: 'B', rating: 5, text: 'Good', relativeTime: '2 days ago', images: [] },
      { id: 'skip', authorName: 'C', rating: 5, text: 'Hidden', relativeTime: '3 days ago', images: ['a.jpg'] },
      { id: 'photo', authorName: 'D', rating: 4, text: 'Nice', relativeTime: '4 days ago', images: ['b.jpg'] },
      { id: 'extra', authorName: 'E', rating: 5, text: 'Also', relativeTime: '5 days ago', images: ['c.jpg'] },
    ];
    const shown = publicReviewList({
      cached_reviews: reviews,
      min_rating: 4,
      excluded_review_ids: ['skip'],
      image_filtering: 'images_only',
      sort_by: 'highest_rating',
      max_reviews: 1,
    });

    expect(shown.map((review) => review.id)).toEqual(['extra']);
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
