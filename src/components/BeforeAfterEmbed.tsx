'use client';

import { useEffect, useState } from 'react';
import type { BeforeAfterConfig } from '@/lib/before-after-config';
import { beforeAfterFromDbRow } from '@/lib/before-after-config';
import { getBootstrappedData, type BootstrapData } from '@/lib/bootstrap';
import { getBeforeAfterWidget } from '@/lib/prefetch';
import { BeforeAfterWidget } from './BeforeAfterWidget';
import { WidgetSkeleton } from './WidgetSkeleton';

export function BeforeAfterEmbed({
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
  const initial =
    acceptedBootstrap?.kind === 'before-after' ? acceptedBootstrap : null;
  const [config, setConfig] = useState<BeforeAfterConfig | null>(() =>
    initial ? beforeAfterFromDbRow(initial.config) : null
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (initial) return;
    let cancelled = false;
    void getBeforeAfterWidget(widgetId, apiOrigin)
      .then((row) => {
        if (cancelled) return;
        const next = beforeAfterFromDbRow(row);
        setConfig((current) =>
          current && JSON.stringify(current) === JSON.stringify(next) ? current : next
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

  if (failed) return null;
  if (!config) return <WidgetSkeleton minHeight="320px" />;

  return <BeforeAfterWidget config={config} />;
}
