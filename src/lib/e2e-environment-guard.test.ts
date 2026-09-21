import { describe, expect, it } from 'vitest';
import {
  KNOWN_PRODUCTION_SUPABASE_REF,
  isolatedWebServerEnv,
  projectSelectorMatches,
  validateE2EEnvironment,
} from './e2e-environment-guard';

describe('E2E environment guard', () => {
  const isolated = {
    E2E_SUPABASE_URL: 'https://isolated-test.supabase.co',
    E2E_ALLOWED_SUPABASE_PROJECT_REF: 'isolated-test',
    E2E_SUPABASE_ANON_KEY: 'fixture-anon',
    E2E_SUPABASE_SERVICE_ROLE_KEY: 'fixture-service',
    E2E_BASE_URL: 'http://127.0.0.1:3000',
    E2E_ALLOW_MUTATIONS: 'true',
  };

  it('rejects the current production .env project before server startup', () => {
    expect(
      validateE2EEnvironment(
        {
          SUPABASE_URL: `https://${KNOWN_PRODUCTION_SUPABASE_REF}.supabase.co`,
          SUPABASE_SERVICE_ROLE_KEY: 'inherited-production-secret',
          E2E_ALLOW_MUTATIONS: 'true',
          E2E_SUPABASE_SERVICE_ROLE_KEY: 'same-inherited-secret',
          E2E_SUPABASE_ANON_KEY: 'same-inherited-anon',
          E2E_SUPABASE_URL: `https://${KNOWN_PRODUCTION_SUPABASE_REF}.supabase.co`,
          E2E_ALLOWED_SUPABASE_PROJECT_REF: KNOWN_PRODUCTION_SUPABASE_REF,
          E2E_BASE_URL: 'http://127.0.0.1:3000',
        },
        'mutation'
      )
    ).toMatch(/known production/i);
  });

  it('rejects generic opt-in without dedicated credentials', () => {
    expect(
      validateE2EEnvironment(
        {
          SUPABASE_URL: 'https://isolated-test.supabase.co',
          SUPABASE_SERVICE_ROLE_KEY: 'inherited',
          E2E_ALLOW_MUTATIONS: 'true',
        },
        'mutation'
      )
    ).toMatch(/dedicated E2E_SUPABASE_URL/i);
  });

  it('accepts an explicitly isolated local mutation target', () => {
    expect(validateE2EEnvironment(isolated, 'mutation')).toBeNull();
  });

  it('accepts an explicitly allowlisted local Supabase fixture', () => {
    expect(
      validateE2EEnvironment(
        {
          ...isolated,
          E2E_SUPABASE_URL: 'http://127.0.0.1:4315',
          E2E_ALLOWED_SUPABASE_PROJECT_REF: 'local',
        },
        'mutation'
      )
    ).toBeNull();
  });

  it('rejects a mutation pointed at an arbitrary vercel host', () => {
    expect(
      validateE2EEnvironment(
        { ...isolated, E2E_BASE_URL: 'https://preview-123.vercel.app' },
        'mutation'
      )
    ).toMatch(/localhost|exact URL/i);
  });

  it('rejects every mutation server-skip value, including false-looking strings', () => {
    expect(
      validateE2EEnvironment(
        { ...isolated, E2E_SKIP_WEBSERVER: '0' },
        'mutation'
      )
    ).toMatch(/reuse|external/i);
  });

  it('requires an explicit canary URL and rejects the production serving alias', () => {
    expect(validateE2EEnvironment({}, 'canary')).toMatch(/E2E_CANARY_URL/i);
    expect(
      validateE2EEnvironment(
        { E2E_CANARY_URL: 'https://custom-widgets-phi.vercel.app' },
        'canary'
      )
    ).toMatch(/production|known/i);
    expect(
      validateE2EEnvironment(
        { E2E_CANARY_URL: 'https://builtbyshahwidgets.com' },
        'canary'
      )
    ).toMatch(/known|production/i);
  });

  it('matches wildcard Playwright selectors against guarded projects', () => {
    expect(projectSelectorMatches('mut*', 'mutation')).toBe(true);
    expect(projectSelectorMatches('*', 'canary')).toBe(true);
    expect(projectSelectorMatches('local', 'mutation')).toBe(false);
  });

  it('masks external delivery credentials for the Next test server', () => {
    expect(isolatedWebServerEnv(isolated)).toMatchObject({
      RESEND_API_KEY: '',
      ALERT_EMAILS: '',
      SCRAPEDO_API_KEY: '',
      SUPABASE_URL: isolated.E2E_SUPABASE_URL,
    });
  });
});
