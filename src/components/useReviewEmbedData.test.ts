// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BootstrapData } from '@/lib/bootstrap';

const prefetch = vi.hoisted(() => ({
  getWidgetConfig: vi.fn(),
  getWidgetReviews: vi.fn(),
}));

vi.mock('@/lib/prefetch', () => prefetch);

import { useReviewEmbedData } from './useReviewEmbedData';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const widgetId = '11111111-1111-4111-8111-111111111111';
const apiOrigin = 'https://widgets.example';
const mounted: Array<{ container: HTMLDivElement; unmount: () => void }> = [];

function Probe({ bootstrap }: { bootstrap?: BootstrapData }) {
  const data = useReviewEmbedData(widgetId, apiOrigin, bootstrap);
  return createElement('output', {
    'data-min-rating': data.config?.minRating ?? '',
    'data-business': data.business?.name ?? '',
    'data-reviews': data.reviews?.map((review) => review.id).join(',') ?? '',
    'data-failed': String(data.failed),
  });
}

function renderProbe(bootstrap?: BootstrapData): HTMLOutputElement {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  mounted.push({ container, unmount: () => root.unmount() });
  act(() => root.render(createElement(Probe, { bootstrap })));
  const output = container.querySelector('output');
  if (!output) throw new Error('Review embed probe did not render');
  return output;
}

async function flushLoads(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  prefetch.getWidgetConfig.mockReset();
  prefetch.getWidgetReviews.mockReset();
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  delete window.__BBS_WIDGET_DATA__;
  delete window.__BBS_WIDGET_DATA_BY_ORIGIN__;
});

afterEach(() => {
  while (mounted.length > 0) {
    const view = mounted.pop();
    if (!view) continue;
    act(() => view.unmount());
    view.container.remove();
  }
  vi.restoreAllMocks();
});

describe('review embed data loading', () => {
  it('uses a validated bootstrap snapshot without issuing legacy requests', () => {
    const bootstrap: BootstrapData = {
      schemaVersion: 1,
      kind: 'reviews',
      config: { id: widgetId, min_rating: 4 },
      business: {
        name: 'Bootstrap Shop',
        address: '1 Main Street',
        totalReviews: 1,
        averageRating: 5,
      },
      reviews: [{
        id: 'review-1',
        authorName: 'Ada',
        rating: 5,
        text: 'Excellent',
        relativeTime: 'today',
        images: [],
      }],
    };

    const output = renderProbe(bootstrap);

    expect(output.dataset).toMatchObject({
      minRating: '4',
      business: 'Bootstrap Shop',
      reviews: 'review-1',
      failed: 'false',
    });
    expect(prefetch.getWidgetConfig).not.toHaveBeenCalled();
    expect(prefetch.getWidgetReviews).not.toHaveBeenCalled();
  });

  it('maps the legacy config, business, and reviews requested for this origin', async () => {
    prefetch.getWidgetConfig.mockResolvedValue({
      id: widgetId,
      min_rating: 3,
      businesses: {
        name: 'Legacy Shop',
        address: '2 Main Street',
        total_reviews: 9,
        average_rating: 4.7,
      },
    });
    prefetch.getWidgetReviews.mockResolvedValue({
      reviews: [{
        id: 'review-2',
        authorName: 'Grace',
        rating: 5,
        text: 'Great',
        relativeTime: 'yesterday',
        images: [],
      }],
    });

    const output = renderProbe();
    await flushLoads();

    expect(output.dataset).toMatchObject({
      minRating: '3',
      business: 'Legacy Shop',
      reviews: 'review-2',
      failed: 'false',
    });
    expect(prefetch.getWidgetConfig).toHaveBeenCalledWith(widgetId, apiOrigin);
    expect(prefetch.getWidgetReviews).toHaveBeenCalledWith(widgetId, apiOrigin);
  });

  it('marks a widget unavailable when its required config cannot load', async () => {
    prefetch.getWidgetConfig.mockRejectedValue(new Error('HTTP 404'));
    prefetch.getWidgetReviews.mockResolvedValue({ reviews: [] });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const output = renderProbe();
    await flushLoads();

    expect(output.dataset.failed).toBe('true');
  });

  it('keeps a configured widget available when only its optional reviews request fails', async () => {
    prefetch.getWidgetConfig.mockResolvedValue({
      id: widgetId,
      businesses: {
        name: 'Configured Shop',
        address: '',
        total_reviews: 0,
        average_rating: 0,
      },
    });
    prefetch.getWidgetReviews.mockRejectedValue(new Error('HTTP 503'));
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const output = renderProbe();
    await flushLoads();

    expect(output.dataset).toMatchObject({
      business: 'Configured Shop',
      reviews: '',
      failed: 'false',
    });
  });
});
