import { test } from '@playwright/test';
import {
  expectShadowMounted,
  GARYS_WIDGET_IDS,
} from './helpers/shadow';

/**
 * Production canary against https://embed-site-seven.vercel.app/
 * Read-only — never mutates live data.
 */
test.describe('canary embed-site-seven', () => {
  test('badge, carousel, and before/after load on the test site', async ({
    page,
  }) => {
    await page.goto('/');

    for (const id of Object.values(GARYS_WIDGET_IDS)) {
      await expectShadowMounted(page, id);
    }

    await page.waitForFunction(
      (id) => {
        const root = document.querySelector(`[data-bbs-embed="${id}"]`)?.shadowRoot;
        if (!root) return false;
        if (root.querySelector('[data-bbs-widget="reviews"]')) return true;
        return /\d\.\d/.test(root.textContent ?? '');
      },
      GARYS_WIDGET_IDS.badge,
      { timeout: 30_000 }
    );

    await page.waitForFunction(
      (id) => {
        const root = document.querySelector(`[data-bbs-embed="${id}"]`)?.shadowRoot;
        if (!root) return false;
        if (root.querySelector('[data-bbs-widget="carousel"]')) return true;
        return (
          !!root.querySelector('[aria-label="Next reviews"]') ||
          (root.textContent?.length ?? 0) > 40
        );
      },
      GARYS_WIDGET_IDS.carousel,
      { timeout: 30_000 }
    );

    await page.waitForFunction(
      (id) => {
        const root = document.querySelector(`[data-bbs-embed="${id}"]`)?.shadowRoot;
        if (!root) return false;
        if (root.querySelector('[data-bbs-widget="before-after"]')) return true;
        if (root.querySelector('[data-bbs-slider]')) return true;
        if (root.querySelector('img')) return true;
        const text = root.textContent ?? '';
        return text.includes('Drag to compare') || text.includes('Before');
      },
      GARYS_WIDGET_IDS.beforeAfterAudi,
      { timeout: 30_000 }
    );
  });
});
