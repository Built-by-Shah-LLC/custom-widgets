'use client';

import { useEffect, useState } from 'react';
import type { FormConfig } from '@/lib/form-config';
import { formFromDbRow } from '@/lib/form-config';
import { getBootstrappedData, type BootstrapData } from '@/lib/bootstrap';
import { getFormWidget } from '@/lib/prefetch';
import { FormWidget } from './FormWidget';
import { WidgetSkeleton } from './WidgetSkeleton';

export function FormEmbed({
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
  const initial = acceptedBootstrap?.kind === 'form' ? acceptedBootstrap : null;
  const [config, setConfig] = useState<FormConfig | null>(() =>
    initial ? formFromDbRow(initial.config) : null
  );
  const [schemaFingerprint, setSchemaFingerprint] = useState<string | undefined>(
    () => initial?.schemaFingerprint
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (initial) return;
    let cancelled = false;
    void getFormWidget(widgetId, apiOrigin)
      .then((row) => {
        if (cancelled) return;
        const next = formFromDbRow(row);
        setConfig((current) =>
          current && JSON.stringify(current) === JSON.stringify(next) ? current : next
        );
        if (typeof row.schemaFingerprint === 'string') {
          setSchemaFingerprint(row.schemaFingerprint);
        }
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
  if (!config) return <WidgetSkeleton minHeight="460px" maxWidth="560px" />;

  return (
    <FormWidget
      config={config}
      widgetId={widgetId}
      apiOrigin={apiOrigin}
      // Preserve the server-provided public schema fingerprint exactly. The
      // submit route can reject a stale open form without recomputing from a
      // mapped/defaulted client config.
      schemaFingerprint={schemaFingerprint}
    />
  );
}
