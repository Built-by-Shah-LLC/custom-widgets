import { parseGoogleReviewImageUrl } from '@/lib/review-images';

const PUBLIC_IMAGE_CACHE = 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400';
const ERROR_CACHE = 'no-store';

export async function GET(request: Request) {
  const source = new URL(request.url).searchParams.get('url');
  const sourceUrl = source ? parseGoogleReviewImageUrl(source) : null;

  if (!sourceUrl) {
    return new Response('Invalid review image URL', {
      status: 400,
      headers: { 'Cache-Control': ERROR_CACHE },
    });
  }

  let upstream: Response;
  try {
    upstream = await fetch(sourceUrl, {
      cache: 'force-cache',
      redirect: 'manual',
      next: { revalidate: 604800 },
      headers: {
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      },
    });
  } catch {
    return new Response('Review image unavailable', {
      status: 502,
      headers: { 'Cache-Control': ERROR_CACHE },
    });
  }

  const contentType = upstream.headers.get('content-type') ?? '';
  if (!upstream.ok || !contentType.toLowerCase().startsWith('image/') || !upstream.body) {
    return new Response('Review image unavailable', {
      status: 502,
      headers: { 'Cache-Control': ERROR_CACHE },
    });
  }

  const headers = new Headers({
    'Content-Type': contentType,
    'Cache-Control': PUBLIC_IMAGE_CACHE,
    'Access-Control-Allow-Origin': '*',
    'X-Content-Type-Options': 'nosniff',
  });
  const contentLength = upstream.headers.get('content-length');
  if (contentLength) headers.set('Content-Length', contentLength);
  const etag = upstream.headers.get('etag');
  if (etag) headers.set('ETag', etag);

  return new Response(upstream.body, { headers });
}
