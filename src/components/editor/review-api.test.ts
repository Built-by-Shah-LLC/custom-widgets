import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  requestBusinessSelection,
  requestReviewPhotoMigration,
  requestReviewSync,
} from './review-api';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('review editor API actions', () => {
  it.each([
    {
      name: 'review sync',
      run: () => requestReviewSync('place-1'),
      url: '/api/v1/sync',
      body: { placeId: 'place-1' },
    },
    {
      name: 'photo migration',
      run: () => requestReviewPhotoMigration('business-1'),
      url: '/api/v1/review-images/migrate',
      body: { businessId: 'business-1' },
    },
    {
      name: 'business selection',
      run: () => requestBusinessSelection({
        id: 'google-place',
        placeId: 'place-2',
        name: 'Shop',
        address: '1 Main Street',
        source: 'google',
      }),
      url: '/api/v1/businesses',
      body: {
        id: 'google-place',
        placeId: 'place-2',
        name: 'Shop',
        address: '1 Main Street',
        source: 'google',
      },
    },
  ])('preserves the $name endpoint contract', async ({ run, url, body }) => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(run()).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  });

  it('surfaces the server detail that an editor can show to the user', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'Sync failed', message: 'Provider timed out' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      }),
    ));

    await expect(requestReviewSync('place-1')).rejects.toThrow('Provider timed out');
  });

  it('rejects a malformed success instead of silently clearing editor data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response('null', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ));

    await expect(requestReviewPhotoMigration('business-1')).rejects.toThrow(
      'Review photo migration failed',
    );
  });
});
