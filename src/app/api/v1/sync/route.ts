import { NextResponse } from 'next/server';
import { syncBusinessReviews } from '@/lib/sync-reviews';
import { requireAdmin } from '@/lib/require-admin';
import { jsonSaved, publishEmbedWidgets } from '@/lib/widget-publication';

export const maxDuration = 300;

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  const placeId = body.placeId || process.env.SSR_PLACE_ID;

  if (!placeId) {
    return NextResponse.json(
      { error: 'placeId required in request body or SSR_PLACE_ID env var' },
      { status: 400 }
    );
  }

  try {
    // Manual sync only: business selection never calls this endpoint.
    // Scrape.do returns at most 20 reviews per page, so this may fetch 25 pages.
    const result = await syncBusinessReviews(placeId, 500);
    const cache = await publishEmbedWidgets(request, result.widgetIds);
    return jsonSaved(result, cache);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: 'Sync failed', message }, { status: 502 });
  }
}
