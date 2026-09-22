import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { reportCritical } from '@/lib/alerts';
import {
  NO_STORE_HEADERS,
  WIDGET_SCRIPT_CACHE_HEADERS,
} from '@/lib/cache-headers';

const WIDGET_JS_PATH = path.join(process.cwd(), 'public', 'widget.js');

// The renderer file is deployment output; keep Next's route layer from
// snapshotting it while the Vercel CDN follows the explicit response headers.
export const dynamic = 'force-dynamic';

// Cache the file content and ETag in memory so we don't re-read the disk on
// every request. The bundle only changes on deploy, so this is safe.
let cachedBundle: { content: Buffer; etag: string; mtimeMs: number } | null = null;

async function getBundle() {
  const stats = await stat(WIDGET_JS_PATH);

  if (cachedBundle && cachedBundle.mtimeMs === stats.mtimeMs) {
    return cachedBundle;
  }

  const content = await readFile(WIDGET_JS_PATH);
  const etag = `"${createHash('sha256').update(content).digest('hex').slice(0, 16)}"`;
  cachedBundle = { content, etag, mtimeMs: stats.mtimeMs };
  return cachedBundle;
}

// Serves the embed bundle at the same path shape the legacy snippet used
// (https://app.designdetail.io/api/embeds/widget.js), so embed codes pasted
// before this app existed keep working when the domain is pointed at it.
export async function GET(request: Request) {
  try {
    const { content, etag } = await getBundle();

    // Return 304 Not Modified if the client already has this version.
    if (request.headers.get('if-none-match') === etag) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          ...WIDGET_SCRIPT_CACHE_HEADERS,
          'Access-Control-Allow-Origin': '*',
          'Timing-Allow-Origin': '*',
          'Content-Type': 'application/javascript; charset=utf-8',
          'X-Content-Type-Options': 'nosniff',
          ETag: etag,
        },
      });
    }

    return new NextResponse(new Uint8Array(content), {
      headers: {
        ...WIDGET_SCRIPT_CACHE_HEADERS,
        'Content-Type': 'application/javascript; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Timing-Allow-Origin': '*',
        'Content-Length': String(content.length),
        ETag: etag,
      },
    });
  } catch (err) {
    await reportCritical({
      title: 'Embed bundle unavailable',
      message: err instanceof Error ? err.message : 'Failed to serve widget.js',
      fingerprint: 'embed-bundle-unavailable',
      meta: { path: WIDGET_JS_PATH },
    });
    return NextResponse.json(
      { error: 'Embed bundle unavailable' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
