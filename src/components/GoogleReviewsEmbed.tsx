'use client';

import { useEffect, useState } from 'react';
import type { BusinessInfo, Review } from '@/lib/reviews-data';
import type { WidgetConfig } from '@/lib/widget-config';
import { configFromDbRow } from '@/lib/widget-config';
import { getBootstrappedData, type BootstrapData } from '@/lib/bootstrap';
import { getWidgetConfig, getWidgetReviews } from '@/lib/prefetch';
import { mapBusinessRow, mapReviewsToClient } from '@/lib/widget-mappers';
import { GoogleReviewsWidget } from './GoogleReviewsWidget';
import { WidgetSkeleton } from './WidgetSkeleton';

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
  const [acceptedBootstrap] = useState<BootstrapData | null>(() =>
    bootstrap ?? getBootstrappedData(widgetId, apiOrigin)
  );
  const initial = acceptedBootstrap?.kind === 'reviews' ? acceptedBootstrap : null;
  const [config, setConfig] = useState<WidgetConfig | null>(() =>
    initial ? configFromDbRow(initial.config) : null
  );
  const [business, setBusiness] = useState<BusinessInfo | undefined>(() =>
    initial?.business ?? undefined
  );
  const [reviews, setReviews] = useState<Review[] | undefined>(() =>
    initial ? mapReviewsToClient(initial.reviews) : undefined
  );
  const [failed, setFailed] = useState(false);

  // Legacy fallback: the bootstrap path is intentionally the only request
  // path for a validated snapshot, so a normal mount never refetches config or
  // reviews that were already delivered in data.js.
  useEffect(() => {
    if (initial) return;
    let cancelled = false;

    void getWidgetConfig(widgetId, apiOrigin)
      .then((row) => {
        if (cancelled) return;
        const nextConfig = configFromDbRow(row);
        const nextBusiness = mapBusinessRow(row.businesses);

        setConfig((current) =>
          current && JSON.stringify(current) === JSON.stringify(nextConfig)
            ? current
            : nextConfig
        );
        setBusiness((current) =>
          current && JSON.stringify(current) === JSON.stringify(nextBusiness)
            ? current
            : nextBusiness
        );
      })
      .catch((err) => {
        console.warn(`[custom-widgets] Failed to load widget ${widgetId}:`, err);
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [apiOrigin, initial, widgetId]);

  useEffect(() => {
    if (initial) return;
    let cancelled = false;

    void getWidgetReviews(widgetId, apiOrigin)
      .then((data) => {
        if (cancelled) return;
        const next = mapReviewsToClient(data.reviews);
        setReviews((current) =>
          current && JSON.stringify(current) === JSON.stringify(next) ? current : next
        );
      })
      .catch((err) => {
        console.warn(`[custom-widgets] Failed to load reviews for ${widgetId}:`, err);
      });

    return () => {
      cancelled = true;
    };
  }, [apiOrigin, initial, widgetId]);

  if (failed) return null;
  if (!config) return <WidgetSkeleton minHeight="60px" />;

  return (
    <GoogleReviewsWidget
      widgetId={widgetId}
      config={config}
      business={business}
      reviews={reviews}
    />
  );
}
