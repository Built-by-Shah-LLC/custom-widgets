import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  tables: [] as string[],
  deleteByTag: vi.fn().mockResolvedValue(undefined),
  ids: {
    widgets: '004a7b18-6bcc-4b2a-a8f9-454012312690',
    before_after_widgets: '1cb98d3c-e962-45be-8fac-5859aa7143b8',
    form_widgets: 'd211c191-47ba-4cd2-adab-f38d459d38d6',
  } as Record<string, string>,
}));

vi.mock('@vercel/functions', () => ({ dangerouslyDeleteByTag: mocks.deleteByTag }));
vi.mock('./db', () => ({
  supabase: {
    from: (table: string) => {
      mocks.tables.push(table);
      return { select: async () => ({ data: [{ id: mocks.ids[table] }], error: null }) };
    },
  },
}));

import { publishAllEmbedWidgets } from './widget-publication';

afterEach(() => {
  delete process.env.VERCEL;
  mocks.tables.length = 0;
  mocks.deleteByTag.mockClear();
});

describe('publishAllEmbedWidgets', () => {
  it('lists three widget tables and performs one batched purge without HTTP probes', async () => {
    process.env.VERCEL = '1';
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    try {
      const result = await publishAllEmbedWidgets(new Request('https://widgets.example/settings'));
      expect(result).toEqual({ fresh: true });
      expect(mocks.tables.sort()).toEqual(['before_after_widgets', 'form_widgets', 'widgets']);
      expect(mocks.deleteByTag).toHaveBeenCalledTimes(1);
      expect(mocks.deleteByTag).toHaveBeenCalledWith(
        [`widget-${mocks.ids.widgets}`, `widget-${mocks.ids.before_after_widgets}`, `widget-${mocks.ids.form_widgets}`],
        { revalidationDeadlineSeconds: 0 }
      );
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
