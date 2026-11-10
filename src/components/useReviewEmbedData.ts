'use client';

import { useEffect, useState } from 'react';
import type { BusinessInfo, Review } from '@/lib/reviews-data';
import type { WidgetConfig } from '@/lib/widget-config';
import { configFromDbRow } from '@/lib/widget-config';
import { getBootstrappedData, type BootstrapData } from '@/lib/bootstrap';
import { getWidgetConfig, getWidgetReviews } from '@/lib/prefetch';
import { mapBusinessRow, mapReviewsToClient } from '@/lib/widget-mappers';

export interface ReviewEmbedData {
  config: WidgetConfig | null;
  business: BusinessInfo | undefined;
  reviews: Review[] | undefined;
  failed: boolean;
}

export function useReviewEmbedData(
  widgetId: string,
  apiOrigin: string,
  bootstrap?: BootstrapData,
): ReviewEmbedData {
  // Capture once so a later same-ID script cannot replace this mount's validated snapshot.
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

  useEffect(() => {
    if (initial) return;
    let cancelled = false;

    void getWidgetConfig(widgetId, apiOrigin)
      .then((row) => {
        if (cancelled) return;
        setConfig(configFromDbRow(row));
        setBusiness(mapBusinessRow(row.businesses));
      })
      .catch((error) => {
        console.warn(`[custom-widgets] Failed to load widget ${widgetId}:`, error);
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
        if (!cancelled) setReviews(mapReviewsToClient(data.reviews));
      })
      .catch((error) => {
        console.warn(`[custom-widgets] Failed to load reviews for ${widgetId}:`, error);
      });

    return () => {
      cancelled = true;
    };
  }, [apiOrigin, initial, widgetId]);

  return { config, business, reviews, failed };
}
