'use client';

import type { BootstrapData } from '@/lib/bootstrap';
import { GoogleReviewsCarousel } from './GoogleReviewsCarousel';
import { WidgetSkeleton } from './WidgetSkeleton';
import { useReviewEmbedData } from './useReviewEmbedData';

export function GoogleReviewsCarouselEmbed({
  widgetId,
  apiOrigin = '',
  bootstrap,
}: {
  widgetId: string;
  apiOrigin?: string;
  bootstrap?: BootstrapData;
}) {
  const { config, business, reviews, failed } = useReviewEmbedData(
    widgetId,
    apiOrigin,
    bootstrap,
  );

  if (failed) return null;
  if (!config) return <WidgetSkeleton minHeight="220px" />;

  return (
    <GoogleReviewsCarousel
      widgetId={widgetId}
      config={config}
      business={business}
      reviews={reviews}
      apiOrigin={apiOrigin}
    />
  );
}
