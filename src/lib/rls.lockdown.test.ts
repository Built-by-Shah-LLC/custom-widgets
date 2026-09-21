import { describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { isExplicitlyAllowlistedSupabaseUrl } from './e2e-environment-guard';

/**
 * Confirms migration 014 lockdown: anon key cannot read application tables.
 * Skips when Supabase env is not present (CI without secrets).
 */
describe('RLS lockdown (anon)', () => {
  const url = process.env.E2E_SUPABASE_URL;
  const anon = process.env.E2E_SUPABASE_ANON_KEY;
  const safeIsolatedTarget =
    process.env.E2E_RLS_CHECK === 'true' &&
    Boolean(url && anon) &&
    isExplicitlyAllowlistedSupabaseUrl(process.env);

  it.skipIf(!safeIsolatedTarget)('anon cannot SELECT widgets / reviews / businesses', async () => {
    const client = createClient(url!, anon!);

    for (const table of [
      'widgets',
      'reviews',
      'businesses',
      'before_after_widgets',
      'allowed_domains',
    ] as const) {
      const { data, error } = await client.from(table).select('*').limit(1);
      // With RLS and no policies, PostgREST returns empty or an RLS error —
      // never rows for anon.
      expect(data ?? []).toEqual([]);
      if (error) {
        expect(error.message.toLowerCase()).toMatch(/policy|permission|rls|denied|jwt/i);
      }
    }
  });
});
