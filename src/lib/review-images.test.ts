import { describe, expect, it } from 'vitest';
import {
  googleReviewImageIdentity,
  parseGoogleReviewImageUrl,
  reviewImageCandidates,
  reviewImageProxyUrl,
} from './review-images';

const GOOGLE_IMAGE =
  'https://lh3.googleusercontent.com/grass-cs/example=w120-h120-c';
const WIDGET_ID = '7f3a9c2e-4b1d-4e8f-9a6c-2d5e8f1a3b7c';

describe('review image URLs', () => {
  it('builds a proxy fallback on the widget API origin', () => {
    expect(reviewImageProxyUrl(GOOGLE_IMAGE, 'https://widgets.example.com/')).toBe(
      `https://widgets.example.com/api/v1/review-images?url=${encodeURIComponent(GOOGLE_IMAGE)}`
    );
  });

  it('uses the current origin in dashboard previews', () => {
    expect(reviewImageProxyUrl(GOOGLE_IMAGE)).toBe(
      `/api/v1/review-images?url=${encodeURIComponent(GOOGLE_IMAGE)}`
    );
  });

  it('adds bounded widget and review context to a proxy fallback', () => {
    expect(reviewImageProxyUrl(GOOGLE_IMAGE, 'https://widgets.example.com', {
      widgetId: WIDGET_ID,
      reviewId: 'google-review-123',
    })).toBe(
      `https://widgets.example.com/api/v1/review-images?url=${encodeURIComponent(GOOGLE_IMAGE)}&widgetId=${WIDGET_ID}&reviewId=google-review-123`
    );
  });

  it('does not put preview widget IDs or unbounded review IDs in a public fallback URL', () => {
    expect(reviewImageProxyUrl(GOOGLE_IMAGE, 'https://widgets.example.com', {
      widgetId: 'new',
      reviewId: 'google-review-123',
    })).toBe(
      `https://widgets.example.com/api/v1/review-images?url=${encodeURIComponent(GOOGLE_IMAGE)}`
    );
  });

  it('matches differently sized variants of the same Google review photo', () => {
    expect(googleReviewImageIdentity(GOOGLE_IMAGE)).toBe(
      googleReviewImageIdentity('https://lh3.googleusercontent.com/grass-cs/example=s0')
    );
  });

  it('does not proxy non-Google images', () => {
    const source = 'https://images.example.com/review.jpg';
    expect(reviewImageProxyUrl(source, 'https://widgets.example.com')).toBe(source);
  });

  it('tries the durable proxy before the expiring Google URL', () => {
    expect(reviewImageCandidates(GOOGLE_IMAGE, 'https://widgets.example.com', {
      widgetId: WIDGET_ID,
      reviewId: 'google-review-123',
    })).toEqual([
      `https://widgets.example.com/api/v1/review-images?url=${encodeURIComponent(GOOGLE_IMAGE)}&widgetId=${WIDGET_ID}&reviewId=google-review-123`,
      GOOGLE_IMAGE,
    ]);
  });

  it('does not retry an identical non-Google URL', () => {
    const source = 'https://images.example.com/review.jpg';
    expect(reviewImageCandidates(source, 'https://widgets.example.com')).toEqual([source]);
  });

  it('rejects unsafe proxy targets', () => {
    expect(parseGoogleReviewImageUrl('http://lh3.googleusercontent.com/photo')).toBeNull();
    expect(parseGoogleReviewImageUrl('https://lh3.googleusercontent.com.evil.test/photo')).toBeNull();
    expect(parseGoogleReviewImageUrl('https://user@lh3.googleusercontent.com/photo')).toBeNull();
    expect(parseGoogleReviewImageUrl('not a URL')).toBeNull();
  });
});
