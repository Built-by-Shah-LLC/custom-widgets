import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GoogleReviewsPanel } from './GoogleReviewsPanel';
import { GoogleReviewsWidget } from './GoogleReviewsWidget';

const business = {
  name: 'Test Business',
  address: '123 Main Street',
  totalReviews: 0,
  averageRating: 0,
};

describe('GoogleReviewsPanel review states', () => {
  it('shows an empty state when reviews are loaded but none were fetched', () => {
    const markup = renderToStaticMarkup(createElement(GoogleReviewsPanel, {
      isOpen: true,
      onClose: () => undefined,
      business,
      reviews: [],
    }));

    expect(markup).toContain('No reviews fetched yet.');
    expect(markup).not.toContain('Loading reviews');
  });

  it('shows loading only while the reviews value is unresolved', () => {
    const markup = renderToStaticMarkup(createElement(GoogleReviewsPanel, {
      isOpen: true,
      onClose: () => undefined,
      business,
    }));

    expect(markup).toContain('Loading reviews');
  });
});

describe('GoogleReviewsWidget business data', () => {
  it('renders nothing when business data is missing', () => {
    const markup = renderToStaticMarkup(createElement(GoogleReviewsWidget, {
      preview: true,
    }));

    expect(markup).toBe('');
  });
});
