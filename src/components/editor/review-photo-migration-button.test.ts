import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { defaultWidgetConfig } from '@/lib/widget-config';
import { ContentTab as BadgeContentTab } from './tabs';
import { ContentTab as CarouselContentTab } from './carousel-tabs';

const sharedProps = {
  config: defaultWidgetConfig,
  update: vi.fn(),
  widgetName: 'Reviews',
  onNameChange: vi.fn(),
  reviews: [],
  selectedBusinessId: 'business-1',
  hasReviews: true,
  reviewFetching: false,
  onFetchReviews: vi.fn(),
  photoMigrating: false,
  onMigrateReviewPhotos: vi.fn(),
};

function expectMigrationButtonBelowRefresh(markup: string) {
  const refreshIndex = markup.indexOf('Refresh Reviews');
  const migrationIndex = markup.indexOf('Store Existing Review Photos');
  expect(refreshIndex).toBeGreaterThan(-1);
  expect(migrationIndex).toBeGreaterThan(refreshIndex);
}

describe('review photo migration editor control', () => {
  it('renders below Refresh Reviews in the badge editor', () => {
    const markup = renderToStaticMarkup(createElement(BadgeContentTab, {
      ...sharedProps,
      businessName: 'Company',
      businessAddress: 'Address',
    }));

    expectMigrationButtonBelowRefresh(markup);
  });

  it('renders below Refresh Reviews in the carousel editor', () => {
    const markup = renderToStaticMarkup(createElement(CarouselContentTab, {
      ...sharedProps,
      business: {
        name: 'Company',
        address: 'Address',
        averageRating: 5,
        totalReviews: 10,
      },
    }));

    expectMigrationButtonBelowRefresh(markup);
  });
});
