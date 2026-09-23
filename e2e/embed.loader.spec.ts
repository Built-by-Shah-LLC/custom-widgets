import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const API_ORIGIN = 'https://widget-fixture.example';
const IDS = {
  static: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  dynamic: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  changed: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
} as const;

const bundle = fs.readFileSync(
  path.resolve(process.cwd(), 'public/widget.js'),
  'utf8'
);

function payload(id: string, kind: 'before-after' | 'form' = 'before-after') {
  if (kind === 'form') {
    return {
      schemaVersion: 1,
      kind,
      config: {
        id,
        steps: [
          {
            id: 's1',
            heading: 'Contact',
            fields: [{ id: 'f1', type: 'text', label: 'Name', required: true }],
          },
        ],
      },
      schemaFingerprint: 'fixture-fingerprint',
    };
  }
  return {
    schemaVersion: 1,
    kind,
    config: {
      id,
      before_image_url: 'https://images.example/before.jpg',
      after_image_url: 'https://images.example/after.jpg',
    },
  };
}

function dataScript(id: string): string {
  const value = JSON.stringify(payload(id));
  const origin = JSON.stringify(API_ORIGIN);
  return `(function(){var value=${value};window.__BBS_WIDGET_DATA_BY_ORIGIN__=window.__BBS_WIDGET_DATA_BY_ORIGIN__||{};window.__BBS_WIDGET_DATA_BY_ORIGIN__[${origin}]=window.__BBS_WIDGET_DATA_BY_ORIGIN__[${origin}]||{};window.__BBS_WIDGET_DATA_BY_ORIGIN__[${origin}][${JSON.stringify(id)}]=value;window.__BBS_WIDGET_DATA__=window.__BBS_WIDGET_DATA__||{};window.__BBS_WIDGET_DATA__[${JSON.stringify(id)}]=value;window.dispatchEvent(new CustomEvent("bbs:widget-data-ready",{detail:{id:${JSON.stringify(id)},origin:${origin}}}));})();`;
}

async function routeFixture(page: import('@playwright/test').Page) {
  const dataRequests = new Map<string, number>();
  const bundleRequests = { count: 0 };
  const allRequests: string[] = [];
  let notifyHoldRequested: () => void = () => {};
  let releaseHold: () => void = () => {};
  const holdRequested = new Promise<void>((resolve) => {
    notifyHoldRequested = resolve;
  });
  const holdRelease = new Promise<void>((resolve) => {
    releaseHold = resolve;
  });
  page.on('request', (request) => allRequests.push(request.url()));
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/widget.js') {
      bundleRequests.count += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: bundle,
      });
      return;
    }
    const dataMatch = url.pathname.match(/^\/api\/embeds\/widget\/([^/]+)\/data\.js$/);
    if (dataMatch) {
      const id = decodeURIComponent(dataMatch[1]);
      dataRequests.set(id, (dataRequests.get(id) ?? 0) + 1);
      await route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: dataScript(id),
      });
      return;
    }
    if (url.pathname === '/hold.js') {
      notifyHoldRequested();
      await holdRelease;
      await route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: 'window.__holdEnded=true;',
      });
      return;
    }
    if (url.pathname === '/loader.html') {
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: `<!doctype html><html><head><title>loader fixture</title></head><body>
          <div data-bbs-embed="${IDS.static}"></div>
          <script async src="${API_ORIGIN}/api/embeds/widget/${IDS.static}/data.js"></script>
          <script async src="${API_ORIGIN}/widget.js"></script>
          <script src="/hold.js"></script>
        </body></html>`,
      });
      return;
    }
    if (url.origin === API_ORIGIN || url.origin === 'https://images.example') {
      await route.abort('blockedbyclient');
      return;
    }
    await route.abort('blockedbyclient');
  });
  return { dataRequests, bundleRequests, allRequests, holdRequested, releaseHold };
}

async function waitForMounts(page: import('@playwright/test').Page, count: number) {
  await expect
    .poll(
      () =>
        page.locator('[data-bbs-embed][data-bbs-mounted="true"]')
          .count(),
      { timeout: 15_000 }
    )
    .toBe(count);
}

test.describe('isolated widget loader', () => {
  test('mounts while a parser-blocking host script is held and does not fetch legacy JSON', async ({
    page,
  }) => {
    const fixture = await routeFixture(page);
    try {
      await page.goto(`https://widget-fixture.example/loader.html`, {
        waitUntil: 'commit',
      });
      await fixture.holdRequested;
      await waitForMounts(page, 1);
      await expect
        .poll(() =>
          page.locator(`[data-bbs-embed="${IDS.static}"]`).evaluate(
            (node) => node.shadowRoot?.textContent ?? ''
          )
        )
        .toContain('Before');
      expect(await page.evaluate(() => document.readyState)).toBe('loading');
      expect(fixture.dataRequests.get(IDS.static)).toBe(1);
      expect(fixture.bundleRequests.count).toBe(1);
      // The load-timing beacon (POST /api/v1/widget-timing) is intentional
      // telemetry, not a legacy data fetch — exclude it from this assertion.
      const legacyDataRequests = fixture.allRequests.filter(
        (url) => url.includes('/api/v1/') && !url.includes('/api/v1/widget-timing')
      );
      expect(legacyDataRequests).toHaveLength(0);
    } finally {
      fixture.releaseHold();
    }
    await page.waitForLoadState('domcontentloaded');
  });

  test('dedupes same-ID dynamic bootstrap, tolerates repeated bundles, and mounts unknown IDs', async ({
    page,
  }) => {
    const fixture = await routeFixture(page);
    await page.setContent(`<!doctype html><html><body>
      <div data-bbs-embed="${IDS.dynamic}"></div>
      <div data-bbs-embed="${IDS.dynamic}"></div>
      <script async src="${API_ORIGIN}/widget.js"></script>
      <script async src="${API_ORIGIN}/widget.js?repeat=2"></script>
    </body></html>`);
    await waitForMounts(page, 2);
    expect(fixture.dataRequests.get(IDS.dynamic)).toBe(1);
    expect(fixture.bundleRequests.count).toBe(2);
    expect(
      await page.locator(`[data-bbs-embed="${IDS.dynamic}"]`).evaluateAll((nodes) =>
        nodes.map((node) => node.shadowRoot?.querySelectorAll('.custom-widget-root').length)
      )
    ).toEqual([1, 1]);
  });

  test('tears down owned nodes on ID changes/removal and leaves foreign roots untouched', async ({
    page,
  }) => {
    const fixture = await routeFixture(page);
    await page.setContent(`<!doctype html><html><body>
      <div id="owned" data-bbs-embed="${IDS.dynamic}"></div>
      <script async src="${API_ORIGIN}/widget.js"></script>
    </body></html>`);
    await waitForMounts(page, 1);
    await page.evaluate(({ id, replacement }) => {
      const host = document.querySelector<HTMLElement>('#owned')!;
      host.dataset.bbsEmbed = replacement;
      const foreign = document.createElement('div');
      foreign.dataset.bbsEmbed = id;
      foreign.attachShadow({ mode: 'open' }).textContent = 'foreign';
      document.body.append(foreign);
    }, { id: IDS.dynamic, replacement: IDS.changed });
    await expect
      .poll(() =>
        page.locator(`#owned[data-bbs-mounted="true"]`).count()
      )
      .toBe(1);
    expect(fixture.dataRequests.get(IDS.changed)).toBe(1);
    expect(fixture.dataRequests.get(IDS.dynamic)).toBe(1);
    await page.evaluate(() => document.querySelector<HTMLElement>('#owned')?.remove());
    await expect.poll(() => page.locator('#owned').count()).toBe(0);
    const foreign = await page.locator('[data-bbs-embed]').evaluateAll((nodes) =>
      nodes.map((node) => ({ marker: node.getAttribute('data-bbs-mounted'), text: node.shadowRoot?.textContent }))
    );
    expect(foreign.some((entry) => entry.text === 'foreign' && entry.marker === null)).toBe(true);
  });
});
