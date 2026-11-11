// @vitest-environment jsdom

import { act, createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Review } from '@/lib/reviews-data';
import { defaultWidgetConfig } from '@/lib/widget-config';
import {
  actAndFlush,
  cleanupMounted,
  findButton,
  findButtonContaining,
  mount,
  setNativeValue,
  type MountedView,
} from '@/test-utils/react-dom';

const mocks = vi.hoisted(() => ({
  alert: vi.fn(),
  replace: vi.fn(),
  requestBusinessSelection: vi.fn(),
  requestReviewPhotoMigration: vi.fn(),
  requestReviewSync: vi.fn(),
  showToast: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));

vi.mock('@/components/ScaledCarouselPreview', async () => {
  const { createElement: create } = await import('react');
  return {
    ScaledCarouselPreview: ({
      business,
      reviews,
    }: {
      business?: { name: string };
      reviews: unknown[];
    }) => create(
      'div',
      { 'data-testid': 'carousel-preview' },
      (business?.name ?? 'No business') + ': ' + reviews.length + ' reviews'
    ),
  };
});

vi.mock('./review-api', () => ({
  requestBusinessSelection: mocks.requestBusinessSelection,
  requestReviewPhotoMigration: mocks.requestReviewPhotoMigration,
  requestReviewSync: mocks.requestReviewSync,
}));

vi.mock('@/components/ui/Toast', () => ({
  showToast: mocks.showToast,
}));

import { CarouselEditor } from './CarouselEditor';

const mounted: MountedView[] = [];
const initialReview: Review = {
  id: 'review-1',
  authorName: 'Taylor',
  rating: 5,
  text: 'Excellent service',
  relativeTime: 'a month ago',
};

function renderEditor() {
  const business = {
    id: 'business-1',
    placeId: 'place-1',
    name: 'Original Garage',
    address: '1 Main Street',
    averageRating: 4.8,
    totalReviews: 10,
  };
  return mount(createElement(CarouselEditor, {
    items: [{
      widgetId: 'carousel-1',
      widgetName: 'Customer carousel',
      businessId: business.id,
      placeId: business.placeId,
      initialConfig: defaultWidgetConfig,
      business,
      reviews: [initialReview],
    }],
    initialSelectedId: 'carousel-1',
    allBusinesses: [business],
    reviewsByBusiness: { [business.id]: [initialReview] },
  }), mounted);
}

beforeEach(() => {
  vi.stubGlobal('alert', mocks.alert);
  mocks.alert.mockReset();
  mocks.replace.mockReset();
  mocks.requestBusinessSelection.mockReset();
  mocks.requestReviewPhotoMigration.mockReset();
  mocks.requestReviewSync.mockReset();
  mocks.showToast.mockReset();
});

afterEach(() => {
  cleanupMounted(mounted);
  vi.unstubAllGlobals();
});

describe('Google Reviews carousel editor workflows', () => {
  it('saves the edited name and selected business', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);
    const container = renderEditor();
    const nameInput = container.querySelector<HTMLInputElement>('input[placeholder="Widget name"]');
    if (!nameInput) throw new Error('Widget name input was not rendered');

    setNativeValue(nameInput, 'Updated carousel');
    await actAndFlush(() => findButton(container, 'Save Changes').click());

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/widgets/carousel-1');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(String(init.body))).toEqual(expect.objectContaining({
      name: 'Updated carousel',
      business_id: 'business-1',
    }));
    expect(findButton(container, 'Saved ✓').textContent?.trim()).toBe('Saved ✓');
  });

  it('shows a failed carousel save instead of claiming completion', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('database unavailable', {
      status: 503,
    })));
    const container = renderEditor();

    await actAndFlush(() => findButton(container, 'Save Changes').click());

    expect(mocks.alert).toHaveBeenCalledWith('Save failed: database unavailable');
    expect(container.textContent).not.toContain('Saved ✓');
  });

  it('refreshes reviews and then migrates their photos for the selected business', async () => {
    const refreshed = { ...initialReview, id: 'review-2', authorName: 'Morgan' };
    mocks.requestReviewSync.mockResolvedValue({
      businessName: 'Original Garage',
      reviews: [refreshed],
      complete: true,
      reviewsFetched: 1,
    });
    mocks.requestReviewPhotoMigration.mockResolvedValue({
      reviews: [refreshed],
      candidateImages: 2,
      storedImages: 2,
      verifiedImages: 2,
      remainingGoogleImages: 0,
      complete: true,
    });
    const container = renderEditor();

    await actAndFlush(() => findButton(container, 'Refresh Reviews').click());
    expect(mocks.requestReviewSync).toHaveBeenCalledWith('place-1');
    expect(container.textContent).toContain('1 latest reviews fetched · 1 stored');

    await actAndFlush(() => findButton(container, 'Store Existing Review Photos').click());
    expect(mocks.requestReviewPhotoMigration).toHaveBeenCalledWith('business-1');
    expect(container.textContent).toContain(
      '2 existing review photos stored in Supabase and byte-verified.'
    );
    expect(container.querySelector('[data-testid="carousel-preview"]')?.textContent)
      .toBe('Original Garage: 1 reviews');
  });

  it('saves the persisted ID returned for a newly selected Google business', async () => {
    const option = {
      id: 'google-result-1',
      placeId: 'place-2',
      name: 'New Garage',
      address: '2 Side Street',
      averageRating: 5,
      totalReviews: 1,
      source: 'google' as const,
    };
    const selectedReview = { ...initialReview, id: 'review-2', authorName: 'Morgan' };
    const fetchMock = vi.fn().mockImplementation((input: string) =>
      input.startsWith('/api/v1/businesses/search')
        ? Promise.resolve(Response.json({ results: [option] }))
        : Promise.resolve(new Response('{}'))
    );
    vi.stubGlobal('fetch', fetchMock);
    mocks.requestBusinessSelection.mockResolvedValue({
      id: 'business-2',
      placeId: 'place-2',
      name: 'New Garage',
      address: '2 Side Street',
      averageRating: 5,
      totalReviews: 1,
      reviews: [selectedReview],
    });
    const container = renderEditor();

    act(() => findButton(container, 'Change').click());
    const search = container.querySelector<HTMLInputElement>('input[placeholder="Search businesses..."]');
    if (!search) throw new Error('Business search input was not rendered');
    setNativeValue(search, 'garage');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 750));
    });
    await actAndFlush(() => findButtonContaining(container, 'New Garage').click());
    await actAndFlush(() => findButton(container, 'Save Changes').click());

    expect(mocks.requestBusinessSelection).toHaveBeenCalledWith(option);
    const saveCall = fetchMock.mock.calls.find(([url]) => url === '/api/v1/widgets/carousel-1');
    if (!saveCall) throw new Error('Carousel save request was not sent');
    expect(JSON.parse(String(saveCall[1]?.body))).toEqual(expect.objectContaining({
      business_id: 'business-2',
    }));
    expect(container.querySelector('[data-testid="carousel-preview"]')?.textContent)
      .toBe('New Garage: 1 reviews');
  });
});
