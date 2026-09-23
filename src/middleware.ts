import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { getSupabaseAnonKey, getSupabaseUrl } from '@/lib/supabase/env';

/** Embed script + bootstrap data — no session required. */
function isPublicEmbedPath(pathname: string, method: string): boolean {
  const upperMethod = method.toUpperCase();
  const isScriptAlias =
    pathname === '/api/embeds/widget.js' ||
    pathname === '/widget.js' ||
    /^\/widget\.[a-f0-9]{16}\.js$/.test(pathname);
  if (isScriptAlias) return upperMethod === 'GET' || upperMethod === 'HEAD';

  return (
    pathname === '/widget-manifest.json' ||
    pathname.startsWith('/api/embeds/widget/')
  ) && ['GET', 'HEAD', 'OPTIONS'].includes(upperMethod);
}

/** Client/embed critical alert intake (rate-limited in the route). */
function isPublicAlertPath(pathname: string, method: string): boolean {
  return pathname === '/api/v1/alerts' && method.toUpperCase() === 'POST';
}

/** Embed load timing beacon (rate-limited + host allowlisted in the route). */
function isPublicWidgetTimingPath(pathname: string, method: string): boolean {
  return pathname === '/api/v1/widget-timing' && method.toUpperCase() === 'POST';
}

/** Local Playwright harness — only when ENABLE_E2E_HARNESS=true. */
function isE2eHarnessPath(pathname: string): boolean {
  return (
    process.env.ENABLE_E2E_HARNESS === 'true' &&
    (pathname === '/e2e/harness' || pathname.startsWith('/e2e/harness/'))
  );
}

/**
 * Cross-origin widget data APIs: only GET/OPTIONS are public (domain allowlist
 * enforced in the route). Mutations on the same paths require admin auth.
 */
function isPublicEmbedDataApi(pathname: string, method: string): boolean {
  const m = method.toUpperCase();
  if (m !== 'GET' && m !== 'OPTIONS' && m !== 'HEAD') return false;

  return (
    pathname === '/api/v1/review-images' ||
    /^\/api\/v1\/widgets\/[^/]+$/.test(pathname) ||
    /^\/api\/v1\/widgets\/[^/]+\/reviews$/.test(pathname) ||
    /^\/api\/v1\/before-after-widgets\/[^/]+$/.test(pathname) ||
    /^\/api\/v1\/form-widgets\/[^/]+$/.test(pathname) ||
    /^\/api\/forms\/[^/]+\/submit$/.test(pathname)
  );
}

/**
 * Public form-submission intake (POST only). Origin allowlist and rate
 * limiting are enforced inside the route.
 */
function isPublicFormSubmit(pathname: string, method: string): boolean {
  return (
    method.toUpperCase() === 'POST' &&
    /^\/api\/forms\/[^/]+\/submit$/.test(pathname)
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const method = request.method;

  // Public embed reads must not pay the session refresh/auth setup cost. The
  // route handlers still perform origin admission and method validation.
  if (
    isPublicEmbedPath(pathname, method) ||
    isPublicEmbedDataApi(pathname, method) ||
    isPublicFormSubmit(pathname, method) ||
    isPublicAlertPath(pathname, method) ||
    isPublicWidgetTimingPath(pathname, method) ||
    isE2eHarnessPath(pathname)
  ) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAuthenticated = !!user;

  if (pathname === '/login' && isAuthenticated) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  if (pathname === '/login') {
    return response;
  }

  // Admin APIs: 401 JSON (do not redirect fetch callers to HTML login).
  if (pathname.startsWith('/api/')) {
    if (!isAuthenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return response;
  }

  if (!isAuthenticated) {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
