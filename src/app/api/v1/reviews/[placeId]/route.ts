import { NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { requireAdmin } from '@/lib/require-admin';

/**
 * Serves cached reviews from Supabase only.
 * SerpAPI is never called here — refresh happens via POST /api/v1/sync.
 * Admin-only: embeds use /api/v1/widgets/[id]/reviews instead.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ placeId: string }> }
) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { placeId } = await params;

  const { data: business, error } = await supabase
    .from('businesses')
    .select('id, name, place_id, address, total_reviews, average_rating')
    .eq('place_id', placeId)
    .single();

  if (error || !business) {
    return NextResponse.json({ error: 'Business not found' }, { status: 404 });
  }

  const { data: reviews } = await supabase
    .from('reviews')
    .select('google_review_id, author_name, author_photo_url, rating, text, relative_time, images')
    .eq('business_id', business.id)
    .order('rating', { ascending: false });

  return NextResponse.json({
    placeId,
    businessName: business.name,
    address: business.address,
    averageRating: business.average_rating,
    totalReviews: business.total_reviews,
    cachedReviews: reviews?.length ?? 0,
    reviews: (reviews ?? []).map((r) => ({
      id: r.google_review_id,
      authorName: r.author_name,
      authorPhotoUrl: r.author_photo_url,
      rating: r.rating,
      text: r.text,
      relativeTime: r.relative_time,
      images: r.images,
    })),
  });
}
