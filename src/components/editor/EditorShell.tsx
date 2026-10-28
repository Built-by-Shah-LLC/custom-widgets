'use client';

import { ReactNode } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils/cn';
import { SettingsIcon } from '@/components/SettingsIcon';

export interface EditorTabDef {
  id: string;
  label: string;
  icon?: ReactNode;
}

export interface EditorTabMeta {
  title: string;
  subtitle: string;
}

/**
 * Shared chrome for the three widget editors: header (back + title),
 * icon tab rail, settings panel (tab meta header + scrollable body +
 * save button bar), and the live preview pane. All tab state, config
 * contracts, save fetches, and preview mounts live in the caller.
 */
export function EditorShell({
  title,
  tabs,
  activeTab,
  onTabChange,
  tabMeta,
  saveLabel,
  saving,
  saved,
  onSave,
  saveHint,
  previewLabel,
  children,
  preview,
}: {
  title: string;
  tabs: EditorTabDef[];
  activeTab: string;
  onTabChange: (id: string) => void;
  tabMeta: Record<string, EditorTabMeta>;
  saveLabel: string;
  saving: boolean;
  saved: boolean;
  onSave: () => void;
  saveHint?: string;
  previewLabel: string;
  /** Settings-panel tab body (the caller renders the active tab). */
  children: ReactNode;
  /** Live preview pane content — the widget preview mount lives here. */
  preview: ReactNode;
}) {
  const meta = tabMeta[activeTab] ?? { title: '', subtitle: '' };

  return (
    <div className="flex h-screen flex-col bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)]">
      {/* Header */}
      <div className="flex h-14 flex-shrink-0 items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-bg-primary)] px-4">
        <Link
          href="/"
          title="Back to Widgets"
          className="ui-control ui-focus-ring flex h-9 w-9 items-center justify-center rounded-lg text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </Link>
        <h1 className="text-lg font-bold">{title}</h1>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Icon rail */}
        <div className="flex w-[72px] flex-shrink-0 flex-col gap-1 border-r border-[var(--color-border)] bg-[var(--color-bg-primary)] px-2 py-2">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onTabChange(t.id)}
              data-active={activeTab === t.id ? 'true' : undefined}
              className={cn(
                'editor-nav-item ui-control flex flex-col items-center gap-1 rounded-lg px-1 py-3 text-[11px] transition-colors',
                activeTab === t.id
                  ? ''
                  : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]'
              )}
            >
              {t.id === 'settings' ? <SettingsIcon className="h-5 w-5" /> : t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {/* Settings panel */}
        <div className="flex w-[420px] flex-shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-bg-primary)]">
          <div className="p-5">
            <h2 className="text-lg font-bold">{meta.title}</h2>
            <p className="mt-0.5 text-sm text-[var(--color-text-secondary)]">{meta.subtitle}</p>
          </div>

          <div className="editor-scroll flex-1 overflow-y-auto p-5">
            <div key={activeTab} className="editor-tab-enter">
              {children}
            </div>
          </div>

          <div className="p-4 pb-7">
            <Button
              onClick={onSave}
              disabled={saving}
              fullWidth
              iconLeft={
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" />
                  <path d="M17 21v-8H7v8M7 3v5h8" />
                </svg>
              }
            >
              {saving ? 'Saving...' : saved ? 'Saved ✓' : saveLabel}
            </Button>
            {saveHint && (
              <p className="mt-2 text-center text-xs text-[var(--color-text-muted)]">{saveHint}</p>
            )}
          </div>
        </div>

        {/* Live preview */}
        <div className="relative flex-1 overflow-hidden bg-[var(--color-bg-secondary)]">
          <div className="absolute top-4 left-5 text-sm text-[var(--color-text-secondary)]">
            {previewLabel} <span className="text-[var(--color-text-muted)]">· live preview</span>
          </div>
          {preview}
        </div>
      </div>
    </div>
  );
}
