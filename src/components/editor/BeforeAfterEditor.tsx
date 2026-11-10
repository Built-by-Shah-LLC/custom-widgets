'use client';

import { useState } from 'react';
import type { BeforeAfterConfig } from '@/lib/before-after-config';
import { beforeAfterToDbRow } from '@/lib/before-after-config';
import { BeforeAfterWidget } from '@/components/BeforeAfterWidget';
import { EditorShell } from './EditorShell';
import {
  standardEditorTabMeta as tabMeta,
  standardEditorTabs as tabs,
  type StandardEditorTab as EditorTab,
} from './shared-tabs';
import { ContentTab, LayoutTab, SettingsTab, StyleTab } from './before-after-tabs';
import { liveCacheWarningFromText } from '@/lib/live-cache-warning';
import { showToast } from '@/components/ui/Toast';

export interface BeforeAfterEditorWidget {
  widgetId: string;
  widgetName: string;
  initialConfig: BeforeAfterConfig;
}

export function BeforeAfterEditor({
  items,
  initialSelectedId,
}: {
  items: BeforeAfterEditorWidget[];
  initialSelectedId?: string;
}) {
  const [selectedId] = useState<string>(() =>
    initialSelectedId && items.some((i) => i.widgetId === initialSelectedId)
      ? initialSelectedId
      : (items[0]?.widgetId ?? '')
  );
  const [configs, setConfigs] = useState<Record<string, BeforeAfterConfig>>(() =>
    Object.fromEntries(items.map((i) => [i.widgetId, i.initialConfig]))
  );
  const [names, setNames] = useState<Record<string, string>>(() =>
    Object.fromEntries(items.map((i) => [i.widgetId, i.widgetName]))
  );
  const [activeTab, setActiveTab] = useState<EditorTab>('content');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const selected = items.find((i) => i.widgetId === selectedId);

  if (!selected) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)]">
        No Before/After Slider widgets found. Add a row to before_after_widgets in Supabase first.
      </div>
    );
  }

  const config = configs[selectedId] ?? selected.initialConfig;
  const widgetName = names[selectedId] ?? selected.widgetName;

  const update = <K extends keyof BeforeAfterConfig>(key: K, value: BeforeAfterConfig[K]) => {
    setConfigs((c) => ({ ...c, [selectedId]: { ...config, [key]: value } }));
    setSaved(false);
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/before-after-widgets/${selectedId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: widgetName, ...beforeAfterToDbRow(config) }),
      });
      const raw = await res.text();
      if (!res.ok) throw new Error(raw);
      const warning = liveCacheWarningFromText(raw);
      if (warning) showToast(warning, 'warning', 8000);
      setSaved(true);
    } catch (err) {
      alert(`Save failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  const tabProps = {
    config,
    update,
    widgetName,
    onNameChange: (name: string) => {
      setNames((n) => ({ ...n, [selectedId]: name }));
      setSaved(false);
    },
  };

  return (
    <EditorShell
      title="Edit Before/After Slider"
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={(id) => setActiveTab(id as EditorTab)}
      tabMeta={tabMeta}
      saveLabel="Update Embed"
      saving={saving}
      saved={saved}
      onSave={save}
      saveHint="Upload custom images or use the defaults to update your embed"
      previewLabel={widgetName}
      preview={
        <div className="flex h-full items-center justify-center p-10">
          <div className="w-full max-w-3xl">
            {/* Keyed by sliderPosition so the editor's Slider Position
                control remounts the widget at the configured position. */}
            <BeforeAfterWidget key={`${selectedId}-${config.sliderPosition}`} config={config} />
          </div>
        </div>
      }
    >
      {activeTab === 'content' && <ContentTab {...tabProps} />}
      {activeTab === 'style' && <StyleTab {...tabProps} />}
      {activeTab === 'layout' && <LayoutTab {...tabProps} />}
      {activeTab === 'settings' && <SettingsTab {...tabProps} />}
    </EditorShell>
  );
}
