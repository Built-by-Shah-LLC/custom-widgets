'use client';

import { useState } from 'react';
import type {
  FormConfig,
  FormField,
  FormStep,
  FormFieldType,
} from '@/lib/form-config';
import {
  defaultFormField,
  formToDbRow,
  makeFieldId,
  makeOptionId,
  makeStepId,
} from '@/lib/form-config';
import { FormWidget } from '@/components/FormWidget';
import { EditorShell, type EditorTabDef, type EditorTabMeta } from './EditorShell';
import { ContentTab, SettingsTab, StepsTab, StyleTab } from './form-tabs';
import { liveCacheWarningFromText } from '@/lib/live-cache-warning';
import { showToast } from '@/components/ui/Toast';

export interface FormEditorWidget {
  widgetId: string;
  widgetName: string;
  initialConfig: FormConfig;
}

type EditorTab = 'content' | 'steps' | 'style' | 'settings';

/**
 * Step/field mutators for the steps tab. All operate on a fresh `steps`
 * array so the editor state updates immutably.
 */
export interface FormStepsApi {
  addStep: () => void;
  removeStep: (stepId: string) => void;
  moveStep: (stepId: string, direction: -1 | 1) => void;
  updateStep: (stepId: string, patch: Partial<FormStep>) => void;
  addField: (stepId: string, type: FormFieldType) => void;
  removeField: (stepId: string, fieldId: string) => void;
  moveField: (stepId: string, fieldId: string, direction: -1 | 1) => void;
  updateField: (stepId: string, fieldId: string, patch: Partial<FormField>) => void;
  addOption: (stepId: string, fieldId: string) => void;
  removeOption: (stepId: string, fieldId: string, optionId: string) => void;
  moveOption: (stepId: string, fieldId: string, optionId: string, direction: -1 | 1) => void;
  updateOption: (stepId: string, fieldId: string, optionId: string, label: string) => void;
}

const tabs: EditorTabDef[] = [
  {
    id: 'content',
    label: 'Content',
    icon: <span className="font-serif text-xl font-bold">T</span>,
  },
  {
    id: 'steps',
    label: 'Steps',
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
        <path d="M9 6h6M9 12h6M9 18h6" />
        <path d="M4 6h.01M4 12h.01M4 18h.01" />
      </svg>
    ),
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
  content: { title: 'Content', subtitle: 'Name, logo, and form basics' },
  steps: { title: 'Steps', subtitle: 'Add, remove, reorder and configure steps + fields' },
  style: { title: 'Style', subtitle: 'Theme colors, typography, container, inputs, and buttons' },
  settings: { title: 'Settings', subtitle: 'Submission behavior and success / error screens' },
};

export function FormEditor({
  items,
  initialSelectedId,
}: {
  items: FormEditorWidget[];
  initialSelectedId?: string;
}) {
  const [selectedId] = useState<string>(() =>
    initialSelectedId && items.some((i) => i.widgetId === initialSelectedId)
      ? initialSelectedId
      : (items[0]?.widgetId ?? '')
  );
  const [configs, setConfigs] = useState<Record<string, FormConfig>>(() =>
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
        No form widgets found. Create one from the Widgets home page first.
      </div>
    );
  }

  const config = configs[selectedId] ?? selected.initialConfig;
  const widgetName = names[selectedId] ?? selected.widgetName;

  const update = <K extends keyof FormConfig>(key: K, value: FormConfig[K]) => {
    setConfigs((c) => ({ ...c, [selectedId]: { ...config, [key]: value } }));
    setSaved(false);
  };

  const setSteps = (steps: FormStep[]) => update('steps', steps);

  const stepsApi: FormStepsApi = {
    addStep: () => {
      setSteps([
        ...config.steps,
        {
          id: makeStepId(),
          heading: 'New Step',
          description: '',
          fields: [defaultFormField('text')],
        },
      ]);
    },
    removeStep: (stepId) => {
      setSteps(config.steps.filter((s) => s.id !== stepId));
    },
    moveStep: (stepId, direction) => {
      const index = config.steps.findIndex((s) => s.id === stepId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= config.steps.length) return;
      const next = [...config.steps];
      const [removed] = next.splice(index, 1);
      next.splice(target, 0, removed);
      setSteps(next);
    },
    updateStep: (stepId, patch) => {
      setSteps(config.steps.map((s) => (s.id === stepId ? { ...s, ...patch } : s)));
    },
    addField: (stepId, type) => {
      setSteps(
        config.steps.map((s) =>
          s.id === stepId ? { ...s, fields: [...s.fields, defaultFormField(type)] } : s
        )
      );
    },
    removeField: (stepId, fieldId) => {
      setSteps(
        config.steps.map((s) =>
          s.id === stepId
            ? { ...s, fields: s.fields.filter((f) => f.id !== fieldId) }
            : s
        )
      );
    },
    moveField: (stepId, fieldId, direction) => {
      setSteps(
        config.steps.map((s) => {
          if (s.id !== stepId) return s;
          const index = s.fields.findIndex((f) => f.id === fieldId);
          const target = index + direction;
          if (index < 0 || target < 0 || target >= s.fields.length) return s;
          const next = [...s.fields];
          const [removed] = next.splice(index, 1);
          next.splice(target, 0, removed);
          return { ...s, fields: next };
        })
      );
    },
    updateField: (stepId, fieldId, patch) => {
      setSteps(
        config.steps.map((s) =>
          s.id === stepId
            ? {
                ...s,
                fields: s.fields.map((f) => (f.id === fieldId ? { ...f, ...patch } : f)),
              }
            : s
        )
      );
    },
    addOption: (stepId, fieldId) => {
      setSteps(
        config.steps.map((s) =>
          s.id === stepId
            ? {
                ...s,
                fields: s.fields.map((f) =>
                  f.id === fieldId
                    ? {
                        ...f,
                        options: [...(f.options ?? []), { id: makeOptionId(), label: 'Option' }],
                      }
                    : f
                ),
              }
            : s
        )
      );
    },
    removeOption: (stepId, fieldId, optionId) => {
      setSteps(
        config.steps.map((s) =>
          s.id === stepId
            ? {
                ...s,
                fields: s.fields.map((f) =>
                  f.id === fieldId
                    ? { ...f, options: (f.options ?? []).filter((o) => o.id !== optionId) }
                    : f
                ),
              }
            : s
        )
      );
    },
    moveOption: (stepId, fieldId, optionId, direction) => {
      setSteps(
        config.steps.map((s) =>
          s.id === stepId
            ? {
                ...s,
                fields: s.fields.map((f) => {
                  if (f.id !== fieldId) return f;
                  const opts = f.options ?? [];
                  const index = opts.findIndex((o) => o.id === optionId);
                  const target = index + direction;
                  if (index < 0 || target < 0 || target >= opts.length) return f;
                  const next = [...opts];
                  const [removed] = next.splice(index, 1);
                  next.splice(target, 0, removed);
                  return { ...f, options: next };
                }),
              }
            : s
        )
      );
    },
    updateOption: (stepId, fieldId, optionId, label) => {
      setSteps(
        config.steps.map((s) =>
          s.id === stepId
            ? {
                ...s,
                fields: s.fields.map((f) =>
                  f.id === fieldId
                    ? {
                        ...f,
                        options: (f.options ?? []).map((o) =>
                          o.id === optionId ? { ...o, label } : o
                        ),
                      }
                    : f
                ),
              }
            : s
        )
      );
    },
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/form-widgets/${selectedId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: widgetName, ...formToDbRow(config) }),
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
    stepsApi,
    widgetName,
    onNameChange: (name: string) => {
      setNames((n) => ({ ...n, [selectedId]: name }));
      setSaved(false);
    },
  };

  return (
    <EditorShell
      title="Edit Multi-Step Form"
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={(id) => setActiveTab(id as EditorTab)}
      tabMeta={tabMeta}
      saveLabel="Update Embed"
      saving={saving}
      saved={saved}
      onSave={save}
      saveHint="Design your steps and fields, then update the embed"
      previewLabel={widgetName}
      preview={
        <div className="flex h-full items-center justify-center bg-[var(--color-bg-secondary)] p-6">
          <div className="w-full max-w-md">
            {/* Keyed by the full steps structure so structural edits remount
                the preview cleanly (no stale per-step state). */}
            <FormWidget key={JSON.stringify(config.steps)} config={config} />
          </div>
        </div>
      }
    >
      {activeTab === 'content' && <ContentTab {...tabProps} />}
      {activeTab === 'steps' && <StepsTab {...tabProps} />}
      {activeTab === 'style' && <StyleTab {...tabProps} />}
      {activeTab === 'settings' && <SettingsTab {...tabProps} />}
    </EditorShell>
  );
}