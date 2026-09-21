'use client';

import { useEffect, useState } from 'react';
import type { BusinessInfo, Review } from '@/lib/reviews-data';
import type { WidgetConfig } from '@/lib/widget-config';
import { configFromDbRow } from '@/lib/widget-config';
import { getBootstrappedData } from '@/lib/bootstrap';
import { getWidgetConfig, getWidgetReviews } from '@/lib/prefetch';
import { mapBusinessRow, mapReviewsToClient } from '@/lib/widget-mappers';
import { GoogleReviewsWidget } from './GoogleReviewsWidget';
import { WidgetSkeleton } from './WidgetSkeleton';

/**
 * Embed loader. With the data.js bootstrap snippet the first React paint IS
 * the real widget (config + business + reviews initialized synchronously from
 * window.__BBS_WIDGET_DATA__); with legacy snippets it paints a skeleton and
 * the script-eval-time prefetch (already in flight from embed.tsx) resolves
 * right after mount. The API is always re-fetched in the background to
 * revalidate, but state only updates when the payload actually differs — no
 * spurious repaints.
 */
export function GoogleReviewsEmbed({
  widgetId,
  apiOrigin = '',
}: {
  widgetId: string;
  apiOrigin?: string;
}) {
  const [config, setConfig] = useState<WidgetConfig | null>(() => {
    const bootstrap = getBootstrappedData(widgetId);
    return bootstrap?.kind === 'reviews'
      ? configFromDbRow(bootstrap.config)
      : null;
  });
  const [business, setBusiness] = useState<BusinessInfo | undefined>(() => {
    const bootstrap = getBootstrappedData(widgetId);
    return bootstrap?.kind === 'reviews'
      ? (bootstrap.business ?? undefined)
      : undefined;
  });
  const [reviews, setReviews] = useState<Review[] | undefined>(() => {
    const bootstrap = getBootstrappedData(widgetId);
    return bootstrap?.kind === 'reviews'
      ? mapReviewsToClient(bootstrap.reviews ?? [])
      : undefined;
  });
  const [failed, setFailed] = useState(false);

  // Load config + business (deduped with the embed.tsx prefetch) so the badge
  // can render; skip the failed flag when bootstrap already delivered data —
  // a transient revalidation error must not blank a rendered widget.
  useEffect(() => {
    let cancelled = false;

    getWidgetConfig(widgetId, apiOrigin)
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
        if (!cancelled && !getBootstrappedData(widgetId)) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [widgetId, apiOrigin]);

  // Load reviews in the background. The badge doesn't need them until the
  // drawer opens, so this can complete after the initial paint.
  useEffect(() => {
    let cancelled = false;

    getWidgetReviews(widgetId, apiOrigin)
      .then((data) => {
        if (cancelled) return;
        const next = mapReviewsToClient(data.reviews);
        setReviews((current) =>
          current && JSON.stringify(current) === JSON.stringify(next)
            ? current
            : next
        );
      })
      .catch((err) => {
        console.warn(`[custom-widgets] Failed to load reviews for ${widgetId}:`, err);
      });

    return () => {
      cancelled = true;
    };
  }, [widgetId, apiOrigin]);

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
