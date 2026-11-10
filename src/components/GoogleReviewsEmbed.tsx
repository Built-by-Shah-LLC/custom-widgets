'use client';

import type { BootstrapData } from '@/lib/bootstrap';
import { GoogleReviewsWidget } from './GoogleReviewsWidget';
import { WidgetSkeleton } from './WidgetSkeleton';
import { useReviewEmbedData } from './useReviewEmbedData';

/**
 * Embed loader for a reviews badge. A validated bootstrap snapshot is
 * captured once for this mount and is authoritative for the initial render;
 * it prevents a later same-ID script from changing the data while React is
 * starting. Legacy one-script embeds retain their deduped JSON fallback.
 */
export function GoogleReviewsEmbed({
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
  if (!config) return <WidgetSkeleton minHeight="60px" />;

  return (
    <GoogleReviewsWidget
      widgetId={widgetId}
      config={config}
      business={business}
      reviews={reviews}
      apiOrigin={apiOrigin}
    />
  );
}
