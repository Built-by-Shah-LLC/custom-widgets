import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { runStaleReviewSyncMock, reportCriticalMock } = vi.hoisted(() => ({
  runStaleReviewSyncMock: vi.fn(),
  reportCriticalMock: vi.fn(),
}));

vi.mock('@/lib/review-sync-scheduler', () => ({
  runStaleReviewSync: runStaleReviewSyncMock,
}));

vi.mock('@/lib/alerts', () => ({
  reportCritical: reportCriticalMock,
}));

import { GET } from './route';

const CRON_URL = 'https://widgets.example.com/api/cron/review-sync';

function cronRequest(authorization?: string) {
  return new Request(CRON_URL, {
    headers: authorization ? { authorization } : {},
  });
}

beforeEach(() => {
  vi.stubEnv('CRON_SECRET', 'test-cron-secret');
  runStaleReviewSyncMock.mockResolvedValue({
    attempted: 2,
    succeeded: 2,
    failed: [],
    elapsedMs: 12_000,
    remaining: 0,
  });
  reportCriticalMock.mockResolvedValue({ sent: true });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('GET /api/cron/review-sync', () => {
  it('returns 401 when CRON_SECRET is not configured (fail closed)', async () => {
    vi.stubEnv('CRON_SECRET', '');
    runStaleReviewSyncMock.mockClear();

    const response = await GET(cronRequest('Bearer test-cron-secret'));

    expect(response.status).toBe(401);
    expect(runStaleReviewSyncMock).not.toHaveBeenCalled();
  });

  it('returns 401 without an authorization header', async () => {
    const response = await GET(cronRequest());

    expect(response.status).toBe(401);
    expect(runStaleReviewSyncMock).not.toHaveBeenCalled();
  });

  it('returns 401 for a wrong bearer token and never runs the sync', async () => {
    const response = await GET(cronRequest('Bearer not-the-secret'));

    expect(response.status).toBe(401);
    expect(runStaleReviewSyncMock).not.toHaveBeenCalled();
  });

  it('runs the sync and returns the batch report with a valid secret', async () => {
    const response = await GET(cronRequest('Bearer test-cron-secret'));

    expect(response.status).toBe(200);
    expect(runStaleReviewSyncMock).toHaveBeenCalledTimes(1);
    const body = await response.json();
    expect(body).toMatchObject({ attempted: 2, succeeded: 2, remaining: 0 });
    expect(reportCriticalMock).not.toHaveBeenCalled();
  });

  it('alerts when the whole batch fails (systemic outage)', async () => {
    runStaleReviewSyncMock.mockResolvedValue({
      attempted: 3,
      succeeded: 0,
      failed: [
        { placeId: 'p1', name: 'Biz A', error: 'Scrape.do HTTP 503' },
        { placeId: 'p2', name: 'Biz B', error: 'Scrape.do HTTP 503' },
        { placeId: 'p3', name: 'Biz C', error: 'Scrape.do HTTP 503' },
      ],
      elapsedMs: 45_000,
      remaining: 10,
    });

    const response = await GET(cronRequest('Bearer test-cron-secret'));

    expect(response.status).toBe(200);
    expect(reportCriticalMock).toHaveBeenCalledTimes(1);
    expect(reportCriticalMock).toHaveBeenCalledWith(
      expect.objectContaining({
        fingerprint: 'review-sync-cron-total-failure',
        title: expect.stringContaining('total batch failure'),
      })
    );
  });

  it('does not alert on partial failure (per-business flakiness is routine)', async () => {
    runStaleReviewSyncMock.mockResolvedValue({
      attempted: 2,
      succeeded: 1,
      failed: [{ placeId: 'p2', name: 'Biz B', error: 'timeout' }],
      elapsedMs: 30_000,
      remaining: 0,
    });

    const response = await GET(cronRequest('Bearer test-cron-secret'));

    expect(response.status).toBe(200);
    expect(reportCriticalMock).not.toHaveBeenCalled();
  });

  it('does not alert when there was nothing to attempt', async () => {
    runStaleReviewSyncMock.mockResolvedValue({
      attempted: 0,
      succeeded: 0,
      failed: [],
      elapsedMs: 500,
      remaining: 0,
    });

    const response = await GET(cronRequest('Bearer test-cron-secret'));

    expect(response.status).toBe(200);
    expect(reportCriticalMock).not.toHaveBeenCalled();
  });

  it('returns 500 without a stack trace when the scheduler throws', async () => {
    runStaleReviewSyncMock.mockRejectedValue(new Error('database unreachable'));

    const response = await GET(cronRequest('Bearer test-cron-secret'));

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({ error: 'Cron sync failed', message: 'database unreachable' });
    expect(reportCriticalMock).not.toHaveBeenCalled();
  });
});
