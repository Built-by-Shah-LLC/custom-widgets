import { test, expect } from '@playwright/test';
import {
  expectShadowMounted,
  expectWidgetKind,
  GARYS_WIDGET_IDS,
} from './helpers/shadow';

test.describe('local embed harness', () => {
  test.skip(
    !process.env.E2E_SUPABASE_SERVICE_ROLE_KEY,
    'Dedicated E2E_SUPABASE_SERVICE_ROLE_KEY required for local embed E2E'
  );

  test('badge, carousel, and before/after widgets mount and render', async ({
    page,
  }) => {
    await page.goto('/e2e/harness');

    await expectShadowMounted(page, GARYS_WIDGET_IDS.badge);
    await expectWidgetKind(page, GARYS_WIDGET_IDS.badge, 'reviews');

    await expectShadowMounted(page, GARYS_WIDGET_IDS.carousel);
    await expectWidgetKind(page, GARYS_WIDGET_IDS.carousel, 'carousel');

    for (const id of [
      GARYS_WIDGET_IDS.beforeAfterAudi,
      GARYS_WIDGET_IDS.beforeAfterBmw,
      GARYS_WIDGET_IDS.beforeAfterSClass,
    ]) {
      await expectShadowMounted(page, id);
      await expectWidgetKind(page, id, 'before-after');
    }

    // Badge shows a numeric rating inside shadow DOM
    await page.waitForFunction(
      (id) => {
        const host = document.querySelector(`[data-bbs-embed="${id}"]`);
        const text = host?.shadowRoot?.textContent ?? '';
        return /\d\.\d/.test(text);
      },
      GARYS_WIDGET_IDS.badge,
      { timeout: 30_000 }
    );

    // Carousel has next control
    await page.waitForFunction(
      (id) => {
        const host = document.querySelector(`[data-bbs-embed="${id}"]`);
        return !!host?.shadowRoot?.querySelector('[aria-label="Next reviews"]');
      },
      GARYS_WIDGET_IDS.carousel,
      { timeout: 30_000 }
    );

    // Before/after slider responds to a real mouse drag (not synthetic events)
    await page.waitForFunction(
      (id) =>
        !!document
          .querySelector(`[data-bbs-embed="${id}"]`)
          ?.shadowRoot?.querySelector('[data-bbs-slider]'),
      GARYS_WIDGET_IDS.beforeAfterAudi,
      { timeout: 30_000 }
    );

    const slider = page
      .locator(`[data-bbs-embed="${GARYS_WIDGET_IDS.beforeAfterAudi}"]`)
      .locator('[data-bbs-slider]');

    const readDividerLeft = () =>
      page.evaluate((id) => {
        const host = document.querySelector(`[data-bbs-embed="${id}"]`);
        const el = Array.from(
          host?.shadowRoot?.querySelectorAll('[data-bbs-slider] > div') ?? []
        ).find((d) => (d as HTMLElement).style.left?.includes('%')) as
          | HTMLElement
          | undefined;
        return el?.style.left ?? '';
      }, GARYS_WIDGET_IDS.beforeAfterAudi);

    const beforeLeft = await readDividerLeft();
    const box = await slider.boundingBox();
    expect(box).toBeTruthy();

    await page.mouse.move(box!.x + box!.width * 0.2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width * 0.8, box!.y + box!.height / 2, {
      steps: 8,
    });
    await page.mouse.up();

    await expect
      .poll(async () => readDividerLeft(), { timeout: 5_000 })
      .not.toBe(beforeLeft);
  });
});
