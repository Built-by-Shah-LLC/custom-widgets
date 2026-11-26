import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  supabase: { from: mocks.from },
}));

vi.mock('@/lib/before-after-config', () => ({
  beforeAfterFromDbRow: vi.fn((row) => row),
}));

vi.mock('@/components/editor/BeforeAfterEditor', async () => {
  const { createElement: create } = await import('react');
  return {
    BeforeAfterEditor: ({
      items,
      initialSelectedId,
    }: {
      items: Array<{ widgetId: string; widgetName: string }>;
      initialSelectedId?: string;
    }) => create(
      'section',
      { 'data-selected-id': initialSelectedId ?? '' },
      items.map((item) => create(
        'div',
        { key: item.widgetId, 'data-widget-id': item.widgetId },
        item.widgetName
      ))
    ),
  };
});

import BeforeAfterWidgetPage from './page';

function query(data: unknown[]) {
  const chain = {
    eq: vi.fn(),
    order: vi.fn(),
    limit: vi.fn().mockResolvedValue({ data }),
  };
  chain.eq.mockReturnValue(chain);
  chain.order.mockReturnValue(chain);
  return chain;
}

function tableQuery(chain: ReturnType<typeof query>) {
  return { select: vi.fn(() => chain) };
}

describe('BeforeAfterWidgetPage', () => {
  beforeEach(() => {
    mocks.from.mockReset();
  });

  it('loads only the selected widget when it exists', async () => {
    const selected = query([{ id: 'widget-1', name: 'Selected' }]);
    mocks.from.mockReturnValueOnce(tableQuery(selected));

    const page = await BeforeAfterWidgetPage({
      searchParams: Promise.resolve({ id: 'widget-1' }),
    });
    const markup = renderToStaticMarkup(page);

    expect(selected.eq).toHaveBeenCalledWith('id', 'widget-1');
    expect(mocks.from).toHaveBeenCalledTimes(1);
    expect(markup).toContain('data-widget-id="widget-1"');
    expect(markup).toContain('Selected');
  });

  it('falls back to the first widget for a stale selected id', async () => {
    const selected = query([]);
    const fallback = query([{ id: 'widget-2', name: 'Fallback' }]);
    mocks.from
      .mockReturnValueOnce(tableQuery(selected))
      .mockReturnValueOnce(tableQuery(fallback));

    const page = await BeforeAfterWidgetPage({
      searchParams: Promise.resolve({ id: 'missing' }),
    });
    const markup = renderToStaticMarkup(page);

    expect(fallback.order).toHaveBeenCalledWith('created_at', { ascending: true });
    expect(markup).toContain('data-widget-id="widget-2"');
    expect(markup).toContain('Fallback');
    expect(markup).not.toContain('data-widget-id="missing"');
  });
});
