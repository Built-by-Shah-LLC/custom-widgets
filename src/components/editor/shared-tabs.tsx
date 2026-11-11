import type { EditorTabDef, EditorTabMeta } from './EditorShell';

export type StandardEditorTab = 'content' | 'style' | 'layout' | 'settings';

export const contentEditorTab: EditorTabDef = {
  id: 'content',
  label: 'Content',
  icon: <span className="font-serif text-xl font-bold">T</span>,
};

export const styleEditorTab: EditorTabDef = {
  id: 'style',
  label: 'Style',
  icon: (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      <path d="M12 22a10 10 0 110-20c5.5 0 10 4.5 10 9 0 2.5-2 4.5-4.5 4.5h-2.5a2.5 2.5 0 00-2 4c.6.8.4 2.5-1 2.5zm-5-10a1 1 0 100-2 1 1 0 000 2zm4-4a1 1 0 100-2 1 1 0 000 2zm6 0a1 1 0 100-2 1 1 0 000 2zm-4 4a1 1 0 100-2 1 1 0 000 2z" />
    </svg>
  ),
};

export const layoutEditorTab: EditorTabDef = {
  id: 'layout',
  label: 'Layout',
  icon: (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M9 21V9" />
    </svg>
  ),
};

export const settingsEditorTab: EditorTabDef = {
  id: 'settings',
  label: 'Settings',
};

export const standardEditorTabs: EditorTabDef[] = [
  contentEditorTab,
  styleEditorTab,
  layoutEditorTab,
  settingsEditorTab,
];

export const standardEditorTabMeta: Record<StandardEditorTab, EditorTabMeta> = {
  content: { title: 'Content', subtitle: 'Configure your content and basic settings' },
  style: { title: 'Style', subtitle: 'Customize colors, themes, and visual appearance' },
  layout: { title: 'Layout', subtitle: 'Adjust spacing, sizing, and layout options' },
  settings: { title: 'Settings', subtitle: 'Advanced configuration and integration options' },
};
