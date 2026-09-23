import { test, expect } from '@playwright/test';
import { assertE2EEnvironment } from '../src/lib/e2e-environment-guard';

test.beforeAll(() => assertE2EEnvironment(process.env, 'mutation'));

const TEST_NAME_PREFIX = '[TEST]';

function assertTestOnlyName(name: string): void {
  if (!name.trim().startsWith(TEST_NAME_PREFIX)) {
    throw new Error(
      `Refusing to mutate "${name}" — only names starting with "${TEST_NAME_PREFIX}" are allowed in tests`
    );
  }
}

/**
 * Safe CRUD against live DB: only create/update/delete rows named `[TEST] …`.
 * Uses before/after widgets (no business_id) so we never touch live review widgets.
 */
test.describe('admin CRUD (test-only data)', () => {
  test.skip(
    !process.env.E2E_ADMIN_EMAIL || !process.env.E2E_ADMIN_PASSWORD,
    'Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD to run CRUD tests'
  );

  test('login, create [TEST] before/after, update, delete', async ({ page }) => {
    const testName = `${TEST_NAME_PREFIX} Playwright BeforeAfter ${Date.now()}`;
    assertTestOnlyName(testName);

    await page.goto('/login');
    await page.fill('#email', process.env.E2E_ADMIN_EMAIL!);
    await page.fill('#password', process.env.E2E_ADMIN_PASSWORD!);
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });

    const api = page.request;
    let createdId: string | null = null;

    try {
      const create = await api.post('/api/v1/before-after-widgets', {
        data: {
          name: testName,
          before_image_url: '',
          after_image_url: '',
        },
      });
      expect(create.status(), await create.text()).toBe(201);
      const created = await create.json();
      createdId = created.id as string;
      assertTestOnlyName(created.name);

      const updatedName = `${testName} updated`;
      assertTestOnlyName(updatedName);
      const patch = await api.patch(`/api/v1/before-after-widgets/${createdId}`, {
        data: { name: updatedName },
      });
      expect(patch.status()).toBe(200);
      const patched = await patch.json();
      expect(patched.name).toBe(updatedName);

      const del = await api.delete(`/api/v1/before-after-widgets/${createdId}`);
      expect([200, 204]).toContain(del.status());
      createdId = null;
    } finally {
      if (createdId) {
        await api.delete(`/api/v1/before-after-widgets/${createdId}`);
      }
    }
  });
});
