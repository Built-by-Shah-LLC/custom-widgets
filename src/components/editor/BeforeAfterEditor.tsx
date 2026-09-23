'use client';

import { useState } from 'react';
import type { BeforeAfterConfig } from '@/lib/before-after-config';
import { beforeAfterToDbRow } from '@/lib/before-after-config';
import { BeforeAfterWidget } from '@/components/BeforeAfterWidget';
import { EditorShell, type EditorTabDef, type EditorTabMeta } from './EditorShell';
import { ContentTab, LayoutTab, SettingsTab, StyleTab } from './before-after-tabs';
import { liveCacheWarningFromText } from '@/lib/live-cache-warning';
import { showToast } from '@/components/ui/Toast';

export interface BeforeAfterEditorWidget {
  widgetId: string;
  widgetName: string;
  initialConfig: BeforeAfterConfig;
}

type EditorTab = 'content' | 'style' | 'layout' | 'settings';

const tabs: EditorTabDef[] = [
  {
    id: 'content',
    label: 'Content',
    icon: <span className="font-serif text-xl font-bold">T</span>,
  },
  {
    id: 'style',
    label: 'Style',
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
        <path d="M12 22a10 10 0 110-20c5.5 0 10 4.5 10 9 0 2.5-2 4.5-4.5 4.5h-2.5a2.5 2.5 0 00-2 4c.6.8.4 2.5-1 2.5zm-5-10a1 1 0 100-2 1 1 0 000 2zm4-4a1 1 0 100-2 1 1 0 000 2zm6 0a1 1 0 100-2 1 1 0 000 2zm-4 4a1 1 0 100-2 1 1 0 000 2z" />
      </svg>
    ),
  },
  {
    id: 'layout',
    label: 'Layout',
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M3 9h18M9 21V9" />
      </svg>
    ),
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33h.01a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51h.01a1.65 1.65 0 001.82-.33l.06.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00.33 1.82v.01a1.65 1.65 0 00-1.51-1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1H3a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" />
      </svg>
    ),
  },
];

const tabMeta: Record<EditorTab, EditorTabMeta> = {
  content: { title: 'Content', subtitle: 'Configure your content and basic settings' },
  style: { title: 'Style', subtitle: 'Customize colors, themes, and visual appearance' },
  layout: { title: 'Layout', subtitle: 'Adjust spacing, sizing, and layout options' },
  settings: { title: 'Settings', subtitle: 'Advanced configuration and integration options' },
};

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
