import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { migrateBusinessReviewImages } from '@/lib/review-image-migration';
import { jsonSaved, publishEmbedWidgets } from '@/lib/widget-publication';

export const maxDuration = 300;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  const businessId = typeof body.businessId === 'string' ? body.businessId : '';
  if (!UUID_PATTERN.test(businessId)) {
    return NextResponse.json({ error: 'A valid businessId is required' }, { status: 400 });
  }

  try {
    const result = await migrateBusinessReviewImages(businessId);
    const cache = await publishEmbedWidgets(request, result.widgetIds);
    return jsonSaved(result, cache);
  } catch (error) {
    return NextResponse.json({
      error: 'Review photo migration failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 502 });
  }
}
