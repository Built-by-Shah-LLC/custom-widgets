import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({
  supabase: { from: vi.fn() },
}));

vi.mock('@/lib/sync-reviews', () => ({
  syncBusinessReviews: vi.fn(),
}));

import { runStaleReviewSync } from './review-sync-scheduler';

interface QuerySpies {
  select: ReturnType<typeof vi.fn>;
  in: ReturnType<typeof vi.fn>;
  or: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
}

function mockSupabaseSelection({
  rows,
  count,
  selectionError = null,
  countError = null,
}: {
  rows: Array<{ name: string; place_id: string }>;
  count: number;
  selectionError?: { message: string } | null;
  countError?: { message: string } | null;
}) {
  const spies: QuerySpies = {
    select: vi.fn(),
    in: vi.fn(),
    or: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
  };

  spies.limit.mockResolvedValue({ data: rows, error: selectionError });

  const selectionChain: Record<string, unknown> = {};
  selectionChain.in = spies.in.mockReturnValue(selectionChain);
  selectionChain.or = spies.or.mockReturnValue(selectionChain);
  selectionChain.order = spies.order.mockReturnValue({
    limit: spies.limit,
  });

  spies.in.mockReturnValue(selectionChain);
  spies.or.mockReturnValue(selectionChain);
  spies.order.mockReturnValue({ limit: spies.limit });

  const headChain: Record<string, unknown> = {};
  headChain.in = spies.in;
  headChain.or = spies.or;
  spies.in.mockReturnValueOnce(selectionChain).mockReturnValueOnce(headChain);
  spies.or.mockReturnValueOnce(selectionChain).mockReturnValueOnce(
    Promise.resolve({ count, error: countError })
  );

  spies.select.mockReturnValueOnce(selectionChain).mockReturnValueOnce(headChain);

  const from = vi.fn().mockReturnValue({ select: spies.select });
  return { from, spies };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('runStaleReviewSync selection', () => {
  it('filters by widget type and sync age, orders stalest first, and caps the batch', async () => {
    const { from, spies } = mockSupabaseSelection({
      rows: [{ name: 'A', place_id: 'p1' }],
      count: 5,
    });

    await runStaleReviewSync({
      supabaseClient: { from } as never,
      sync: vi.fn().mockResolvedValue(undefined),
      sleep: vi.fn(),
    });

    expect(from).toHaveBeenCalledWith('businesses');
    expect(spies.select).toHaveBeenNthCalledWith(
      1,
      'id, name, place_id, reviews_last_synced_at, widgets!inner(id)'
    );
    expect(spies.select).toHaveBeenNthCalledWith(2, 'id', { count: 'exact', head: true });
    expect(spies.in).toHaveBeenCalledWith('widgets.widget_type', [
      'google_reviews',
      'google_reviews_carousel',
    ]);
    expect(spies.or.mock.calls[0][0]).toContain('reviews_last_synced_at.is.null');
    expect(spies.or.mock.calls[0][0]).toContain('reviews_last_synced_at.lt.');
    expect(spies.order).toHaveBeenCalledWith('reviews_last_synced_at', {
      ascending: true,
      nullsFirst: true,
    });
    expect(spies.limit).toHaveBeenCalledWith(100);
  });

  it('throws when the selection query fails', async () => {
    const { from } = mockSupabaseSelection({
      rows: [],
      count: 0,
      selectionError: { message: 'boom' },
    });

    await expect(
      runStaleReviewSync({
        supabaseClient: { from } as never,
        sync: vi.fn(),
        sleep: vi.fn(),
      })
    ).rejects.toThrow('Stale business selection failed: boom');
  });
});

describe('runStaleReviewSync execution', () => {
  it('syncs every selected business in order with 40 reviews and politeness delays', async () => {
    const rows = [
      { name: 'A', place_id: 'p1' },
      { name: 'B', place_id: 'p2' },
      { name: 'C', place_id: 'p3' },
    ];
    const { from } = mockSupabaseSelection({ rows, count: 3 });
    const sync = vi.fn().mockResolvedValue(undefined);
    const sleep = vi.fn().mockResolvedValue(undefined);

    const report = await runStaleReviewSync({
      supabaseClient: { from } as never,
      sync: sync as never,
      sleep,
    });

    expect(sync.mock.calls).toEqual([
      ['p1', 40],
      ['p2', 40],
      ['p3', 40],
    ]);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(1500);
    expect(report).toMatchObject({ attempted: 3, succeeded: 3, failed: [], remaining: 0 });
  });

  it('honours the CRON_SYNC_MAX_REVIEWS env override', async () => {
    vi.stubEnv('CRON_SYNC_MAX_REVIEWS', '100');
    const rows = [{ name: 'A', place_id: 'p1' }];
    const { from } = mockSupabaseSelection({ rows, count: 1 });
    const sync = vi.fn().mockResolvedValue(undefined);

    await runStaleReviewSync({
      supabaseClient: { from } as never,
      sync: sync as never,
      sleep: vi.fn(),
    });

    expect(sync).toHaveBeenCalledWith('p1', 100);
  });

  it('contains per-business failures and keeps syncing the rest', async () => {
    const rows = [
      { name: 'A', place_id: 'p1' },
      { name: 'B', place_id: 'p2' },
    ];
    const { from } = mockSupabaseSelection({ rows, count: 2 });
    const sync = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('scrape.do HTTP 500: upstream exploded'));
    const sleep = vi.fn().mockResolvedValue(undefined);

    const report = await runStaleReviewSync({
      supabaseClient: { from } as never,
      sync: sync as never,
      sleep,
    });

    expect(sync).toHaveBeenCalledTimes(2);
    expect(report.succeeded).toBe(1);
    expect(report.failed).toEqual([
      { placeId: 'p2', name: 'B', error: 'scrape.do HTTP 500: upstream exploded' },
    ]);
  });

  it('stops starting new syncs once the time budget is exhausted, mid-sync never aborts', async () => {
    const rows = [
      { name: 'A', place_id: 'p1' },
      { name: 'B', place_id: 'p2' },
      { name: 'C', place_id: 'p3' },
    ];
    const { from } = mockSupabaseSelection({ rows, count: 3 });

    let elapsed = 0;
    const sync = vi.fn().mockImplementation(async () => {
      if (sync.mock.calls.length === 2) {
        // The second sync blows past the budget while running. It must be
        // allowed to finish; only the THIRD business must be skipped.
        elapsed = 300_000;
      }
    });

    const report = await runStaleReviewSync({
      supabaseClient: { from } as never,
      sync: sync as never,
      sleep: vi.fn().mockResolvedValue(undefined),
      now: () => elapsed,
      budgetMs: 210_000,
    });

    expect(sync.mock.calls.map((call) => call[0])).toEqual(['p1', 'p2']);
    expect(report).toMatchObject({ attempted: 2, succeeded: 2, remaining: 1 });
  });

  it('reports remaining businesses left over by the selection cap', async () => {
    const rows = [{ name: 'A', place_id: 'p1' }];
    const { from } = mockSupabaseSelection({ rows, count: 42 });
    const sync = vi.fn().mockResolvedValue(undefined);

    const report = await runStaleReviewSync({
      supabaseClient: { from } as never,
      sync: sync as never,
      sleep: vi.fn(),
    });

    expect(report.remaining).toBe(41);
  });
});
