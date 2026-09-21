import { describe, expect, it } from 'vitest';
import { parseGoogleReviewImageUrl, reviewImageProxyUrl } from './review-images';

const GOOGLE_IMAGE =
  'https://lh3.googleusercontent.com/grass-cs/example=w120-h120-c';

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

  it('does not proxy non-Google images', () => {
    const source = 'https://images.example.com/review.jpg';
    expect(reviewImageProxyUrl(source, 'https://widgets.example.com')).toBe(source);
  });

  it('rejects unsafe proxy targets', () => {
    expect(parseGoogleReviewImageUrl('http://lh3.googleusercontent.com/photo')).toBeNull();
    expect(parseGoogleReviewImageUrl('https://lh3.googleusercontent.com.evil.test/photo')).toBeNull();
    expect(parseGoogleReviewImageUrl('https://user@lh3.googleusercontent.com/photo')).toBeNull();
    expect(parseGoogleReviewImageUrl('not a URL')).toBeNull();
  });
});
