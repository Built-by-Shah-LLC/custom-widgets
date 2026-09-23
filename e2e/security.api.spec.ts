import { test, expect } from '@playwright/test';
import { GARYS_WIDGET_IDS } from './helpers/shadow';
import { assertE2EEnvironment } from '../src/lib/e2e-environment-guard';

test.beforeAll(() => assertE2EEnvironment(process.env, 'mutation'));

test.describe('auth + security API', () => {
  test.skip(
    !process.env.E2E_SUPABASE_SERVICE_ROLE_KEY,
    'Dedicated E2E_SUPABASE_SERVICE_ROLE_KEY required for local API E2E'
  );

  test('unauthenticated browser is redirected to login', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  });

  test('mutating APIs require auth', async ({ request }) => {
    const post = await request.post('/api/v1/widgets', {
      data: { name: '[TEST] should fail' },
    });
    expect(post.status()).toBe(401);

    const patch = await request.patch(`/api/v1/widgets/${GARYS_WIDGET_IDS.badge}`, {
      data: { name: 'should not rename live' },
    });
    expect(patch.status()).toBe(401);

    const del = await request.delete(`/api/v1/widgets/${GARYS_WIDGET_IDS.badge}`);
    expect(del.status()).toBe(401);

    const domains = await request.post('/api/v1/allowed-domains', {
      data: { domain: 'evil.example' },
    });
    expect(domains.status()).toBe(401);
  });

  test('embed bundle is publicly reachable', async ({ request }) => {
    const res = await request.get('/api/embeds/widget.js');
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body.length).toBeGreaterThan(1000);
    expect(res.headers()['content-type']).toMatch(/javascript/);

    for (const legacyHash of ['ae8df6f21595663e', 'cb1d7a5b739d2865']) {
      const legacy = await request.get(`/widget.${legacyHash}.js`);
      expect(legacy.status()).toBe(200);
      expect(legacy.headers()['content-type']).toMatch(/javascript/);
      expect(await legacy.text()).toBe(body);
    }
  });

  test('widget GET enforces origin allowlist', async ({ request }) => {
    const blocked = await request.get(`/api/v1/widgets/${GARYS_WIDGET_IDS.badge}`, {
      headers: { Origin: 'https://not-allowed-evil.example' },
    });
    expect(blocked.status()).toBe(403);

    // Localhost allowed only when ALLOW_LOCALHOST_EMBEDS=true (webServer sets it).
    const local = await request.get(`/api/v1/widgets/${GARYS_WIDGET_IDS.badge}`, {
      headers: { Origin: 'http://127.0.0.1:3000' },
    });
    expect([200, 403]).toContain(local.status());
    if (local.status() === 200) {
      const json = await local.json();
      expect(json.id).toBe(GARYS_WIDGET_IDS.badge);
    }
  });
});
