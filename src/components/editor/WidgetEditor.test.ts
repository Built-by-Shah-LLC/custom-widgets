// @vitest-environment jsdom

import { act, createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultWidgetConfig } from '@/lib/widget-config';
import type { Review } from '@/lib/reviews-data';
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

vi.mock('@/components/GoogleReviewsWidget', async () => {
  const { createElement: create } = await import('react');
  return {
    GoogleReviewsWidget: ({
      business,
      reviews,
    }: {
      business: { name: string };
      reviews: unknown[];
    }) => create(
      'div',
      { 'data-testid': 'review-preview' },
      business.name + ': ' + reviews.length + ' reviews'
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

import { WidgetEditor } from './WidgetEditor';

const mounted: MountedView[] = [];

const initialReview: Review = {
  id: 'review-1',
  authorName: 'Taylor',
  rating: 5,
  text: 'Excellent service',
  relativeTime: 'a month ago',
};

function renderEditor() {
  return mount(createElement(WidgetEditor, {
    items: [{
      widgetId: 'widget-1',
      businessId: 'business-1',
      placeId: 'place-1',
      widgetName: 'Customer reviews',
      initialConfig: defaultWidgetConfig,
      business: {
        name: 'Original Garage',
        address: '1 Main Street',
        averageRating: 4.8,
        totalReviews: 10,
      },
      reviews: [initialReview],
    }],
    initialSelectedId: 'widget-1',
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

describe('Google Reviews badge editor workflows', () => {
  it('saves an edited widget and reports completion in the rendered controls', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const container = renderEditor();
    const nameInput = container.querySelector<HTMLInputElement>('input[placeholder="Widget name"]');
    if (!nameInput) throw new Error('Widget name input was not rendered');

    setNativeValue(nameInput, 'Updated reviews');
    await actAndFlush(() => findButton(container, 'Save Changes').click());

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/widgets/widget-1');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(String(init.body))).toEqual(expect.objectContaining({
      name: 'Updated reviews',
    }));
    expect(findButton(container, 'Saved ✓').textContent?.trim()).toBe('Saved ✓');
    expect(mocks.alert).not.toHaveBeenCalled();
  });

  it('shows the server response when a save fails and does not claim success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('database unavailable', {
      status: 503,
    })));
    const container = renderEditor();

    await actAndFlush(() => findButton(container, 'Save Changes').click());

    expect(mocks.alert).toHaveBeenCalledWith('Save failed: database unavailable');
    expect(container.textContent).not.toContain('Saved ✓');
  });

  it('refreshes reviews for the selected place and renders the result', async () => {
    const refreshed: Review = {
      ...initialReview,
      id: 'review-2',
      authorName: 'Morgan',
      text: 'Fast and friendly',
    };
    mocks.requestReviewSync.mockResolvedValue({
      businessName: 'Original Garage',
      averageRating: 4.9,
      totalReviews: 11,
      reviews: [refreshed],
      complete: true,
      reviewsFetched: 1,
    });
    const container = renderEditor();

    await actAndFlush(() => findButton(container, 'Refresh Reviews').click());

    expect(mocks.requestReviewSync).toHaveBeenCalledWith('place-1');
    expect(container.textContent).toContain('1 latest reviews fetched · 1 stored');
    expect(container.querySelector('[data-testid="review-preview"]')?.textContent)
      .toBe('Original Garage: 1 reviews');
  });

  it('migrates existing review photos and displays verified completion', async () => {
    mocks.requestReviewPhotoMigration.mockResolvedValue({
      reviews: [initialReview],
      candidateImages: 2,
      storedImages: 2,
      verifiedImages: 2,
      remainingGoogleImages: 0,
      complete: true,
    });
    const container = renderEditor();

    await actAndFlush(() => findButton(container, 'Store Existing Review Photos').click());

    expect(mocks.requestReviewPhotoMigration).toHaveBeenCalledWith('business-1');
    expect(container.textContent).toContain(
      '2 existing review photos stored in Supabase and byte-verified.'
    );
  });

  it('selects a Google business and replaces the preview with its saved reviews', async () => {
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
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ results: [option] }));
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

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/businesses/search?q=garage', {
      signal: expect.any(AbortSignal),
    });
    expect(mocks.requestBusinessSelection).toHaveBeenCalledWith(option);
    expect(container.textContent).toContain('1 reviews available');
    expect(container.querySelector('[data-testid="review-preview"]')?.textContent)
      .toBe('New Garage: 1 reviews');
  });
});
