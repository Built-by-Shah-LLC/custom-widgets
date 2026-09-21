/**
 * Fail-closed environment checks for browser suites that can reach Supabase.
 *
 * Keep this module dependency-free so it can be exercised by unit tests before
 * Playwright starts a Next server. The application intentionally does not
 * infer an isolated project from a generic SUPABASE_URL: callers must opt in
 * with a separately named E2E credential set.
 */

export const KNOWN_PRODUCTION_SUPABASE_REF = 'stdhjzpwhiaoouotbimv';
export const KNOWN_PRODUCTION_HOSTS = new Set([
  'builtbyshahwidgets.com',
  'www.builtbyshahwidgets.com',
  'custom-widgets-phi.vercel.app',
  'app.designdetail.io',
  'embed-site-seven.vercel.app',
]);

export interface E2EEnvironment {
  E2E_ALLOW_MUTATIONS?: string;
  E2E_SUPABASE_URL?: string;
  E2E_SUPABASE_ANON_KEY?: string;
  E2E_SUPABASE_SERVICE_ROLE_KEY?: string;
  E2E_ALLOWED_SUPABASE_PROJECT_REF?: string;
  E2E_BASE_URL?: string;
  E2E_ALLOWED_BASE_URLS?: string;
  E2E_CANARY_URL?: string;
  E2E_SKIP_WEBSERVER?: string;
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  [key: string]: string | undefined;
}

export type E2EProject = 'readonly-local' | 'mutation' | 'canary';
export type PlaywrightProject = E2EProject | 'local' | 'loader';

export const MUTATION_BASE_URL = 'http://127.0.0.1:3000';

/** Keep Playwright's skip switch strict and shared with the guard. */
export function isE2EWebServerSkipped(value: string | undefined): boolean {
  return value === '1' || value === 'true';
}

/** Match Playwright's simple `*`/`?` project selector syntax safely. */
export function projectSelectorMatches(
  selector: string,
  project: PlaywrightProject
): boolean {
  const pattern = selector.replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${pattern}$`).test(project);
}

function cleanUrl(value: string | undefined): string {
  return (value ?? '').trim().replace(/\/+$/, '');
}

function projectRefFromUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      (url.hostname === '127.0.0.1' || url.hostname === 'localhost')
    ) {
      return `local:${url.port || (url.protocol === 'https:' ? '443' : '80')}`;
    }
    const match = url.hostname.match(/^([a-z0-9-]+)\.supabase\.co$/i);
    return match?.[1]?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

function isLocalUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      (url.hostname === '127.0.0.1' || url.hostname === 'localhost')
    );
  } catch {
    return false;
  }
}

function allowedBaseUrls(env: E2EEnvironment): Set<string> {
  return new Set(
    (env.E2E_ALLOWED_BASE_URLS ?? '')
      .split(',')
      .map(cleanUrl)
      .filter(Boolean)
  );
}

/**
 * Returns a safe explanation when the selected project cannot run, or null
 * when it is safe. No secret values are included in the explanation.
 */
export function validateE2EEnvironment(
  env: E2EEnvironment,
  project: E2EProject
): string | null {
  const configuredUrl = cleanUrl(env.E2E_SUPABASE_URL);
  const configuredRef = (env.E2E_ALLOWED_SUPABASE_PROJECT_REF ?? '')
    .trim()
    .toLowerCase();

  if (project === 'canary') {
    const canary = cleanUrl(env.E2E_CANARY_URL);
    if (!canary) return 'E2E_CANARY_URL must be set explicitly for canary tests.';
    let canaryHost = '';
    try {
      const url = new URL(canary);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return 'E2E_CANARY_URL must be an HTTP(S) URL.';
      }
      canaryHost = url.hostname.toLowerCase();
    } catch {
      return 'E2E_CANARY_URL must be a valid HTTP(S) URL.';
    }
    if (KNOWN_PRODUCTION_HOSTS.has(canaryHost)) {
      return 'Known production/canary serving aliases are not allowed as implicit test targets.';
    }
    return null;
  }

  if (project === 'readonly-local' && !configuredUrl) {
    // A local project without dedicated credentials is safe only when its
    // tests are skipped. The Playwright config uses this result to avoid
    // starting a web server with inherited production credentials.
    return null;
  }

  if (!configuredUrl) {
    return 'Dedicated E2E_SUPABASE_URL is required; inherited SUPABASE_URL is not accepted.';
  }

  const projectRef = projectRefFromUrl(configuredUrl);
  if (!projectRef) return 'E2E_SUPABASE_URL must be an exact Supabase project URL.';
  if (projectRef === KNOWN_PRODUCTION_SUPABASE_REF) {
    return 'The known production Supabase project is never allowed for E2E tests.';
  }
  const isAllowlistedLocal = projectRef.startsWith('local:') && configuredRef === 'local';
  if (!configuredRef || (projectRef !== configuredRef && !isAllowlistedLocal)) {
    return 'E2E_SUPABASE_URL must match E2E_ALLOWED_SUPABASE_PROJECT_REF exactly.';
  }

  if (!env.E2E_SUPABASE_ANON_KEY || !env.E2E_SUPABASE_SERVICE_ROLE_KEY) {
    return 'Dedicated E2E Supabase anon and service-role credentials are required.';
  }

  const baseUrl = cleanUrl(env.E2E_BASE_URL);
  const exactPreview = allowedBaseUrls(env).has(baseUrl);
  if (!baseUrl || (!isLocalUrl(baseUrl) && !exactPreview)) {
    return 'E2E_BASE_URL must be localhost or an exact URL in E2E_ALLOWED_BASE_URLS.';
  }

  if (project === 'mutation' && baseUrl !== MUTATION_BASE_URL) {
    return `Mutation suites require the freshly started ${MUTATION_BASE_URL} server.`;
  }

  let baseHost = '';
  try {
    baseHost = new URL(baseUrl).hostname.toLowerCase();
  } catch {
    return 'E2E_BASE_URL must be a valid URL.';
  }
  if (KNOWN_PRODUCTION_HOSTS.has(baseHost)) {
    return 'Known production/canary serving aliases are not mutation targets.';
  }

  if (project === 'mutation' && env.E2E_SKIP_WEBSERVER) {
    return 'Mutation suites cannot reuse an unverified external web server.';
  }

  if (project === 'mutation' && env.E2E_ALLOW_MUTATIONS !== 'true') {
    return 'Set E2E_ALLOW_MUTATIONS=true only when the isolated project and preview URL are confirmed.';
  }

  // Never allow a generic inherited credential to silently become the E2E
  // credential. This check is deliberately based on the URL only and does not
  // compare or print secret values.
  if (
    env.SUPABASE_URL &&
    cleanUrl(env.SUPABASE_URL) === configuredUrl &&
    projectRef === KNOWN_PRODUCTION_SUPABASE_REF
  ) {
    return 'Inherited SUPABASE_URL points at the known production project.';
  }

  return null;
}

export function isKnownProductionSupabaseUrl(value: string | undefined): boolean {
  return projectRefFromUrl(cleanUrl(value)) === KNOWN_PRODUCTION_SUPABASE_REF;
}

export function isExplicitlyAllowlistedSupabaseUrl(
  env: E2EEnvironment
): boolean {
  const url = cleanUrl(env.E2E_SUPABASE_URL);
  const ref = (env.E2E_ALLOWED_SUPABASE_PROJECT_REF ?? '').trim().toLowerCase();
  const projectRef = projectRefFromUrl(url);
  return Boolean(url) &&
    projectRef !== null &&
    (projectRef === ref || (projectRef.startsWith('local:') && ref === 'local')) &&
    ref !== KNOWN_PRODUCTION_SUPABASE_REF;
}

export function assertE2EEnvironment(
  env: E2EEnvironment,
  project: E2EProject
): void {
  const failure = validateE2EEnvironment(env, project);
  if (failure) throw new Error(`[e2e-guard] ${failure}`);
}

/** Map dedicated test credentials into names consumed by the Next app. */
export function isolatedWebServerEnv(env: E2EEnvironment): Record<string, string> {
  return {
    SUPABASE_URL: env.E2E_SUPABASE_URL ?? '',
    NEXT_PUBLIC_SUPABASE_URL: env.E2E_SUPABASE_URL ?? '',
    SUPABASE_ANON_KEY: env.E2E_SUPABASE_ANON_KEY ?? '',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: env.E2E_SUPABASE_ANON_KEY ?? '',
    SUPABASE_SERVICE_ROLE_KEY: env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? '',
    // Test runs must never deliver real customer data or alerts.
    RESEND_API_KEY: '',
    ALERT_FROM: '',
    EMAIL_FROM: '',
    ALERT_EMAILS: '',
    SCRAPEDO_API_KEY: '',
    SCRAPEDO_TOKEN: '',
    GOOGLE_PLACES_API_KEY: '',
    GOOGLE_API_KEY: '',
    DISABLE_EXTERNAL_DELIVERIES: 'true',
  };
}
