/**
 * Verify that widgets embedded on an external website actually mount and
 * render. Loads the page in headless Chromium, waits for the loader to mark
 * placeholders with data-bbs-mounted="true", and checks that each shadow root
 * rendered real content.
 *
 * Usage:
 *   node scripts/check-external-embed.mjs <page-url>
 *
 * Example:
 *   node scripts/check-external-embed.mjs https://embed-site-seven.vercel.app
 *
 * Read-only: only GETs the page like a normal visitor would.
 */
import { chromium } from 'playwright';

const url = process.argv[2];
if (!url) {
  console.error('Usage: node scripts/check-external-embed.mjs <page-url>');
  process.exit(2);
}

const browser = await chromium.launch();
const page = await browser.newPage();
const consoleErrors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
const failedRequests = [];
page.on('requestfailed', (req) =>
  failedRequests.push(`${req.url()} — ${req.failure()?.errorText}`)
);
page.on('response', (res) => {
  if (res.status() >= 400) failedRequests.push(`${res.url()} — HTTP ${res.status()}`);
});

try {
  await page.goto(url, { waitUntil: 'load', timeout: 30_000 });

  const placeholders = page.locator('[data-bbs-embed]');
  const total = await placeholders.count();
  console.log(`Found ${total} widget placeholder(s) on ${url}`);
  if (total === 0) {
    console.log('RESULT: FAIL — no [data-bbs-embed] placeholders on the page');
    process.exit(1);
  }

  // Wait for the loader to mount all placeholders (or time out).
  await page
    .waitForFunction(
      () =>
        document.querySelectorAll('[data-bbs-embed]:not([data-bbs-mounted="true"])')
          .length === 0,
      { timeout: 20_000 }
    )
    .catch(() => {});

  let passed = 0;
  for (let i = 0; i < total; i++) {
    const el = placeholders.nth(i);
    const id = await el.getAttribute('data-bbs-embed');
    const mounted = (await el.getAttribute('data-bbs-mounted')) === 'true';
    const info = await el.evaluate((node) => {
      const root = node.shadowRoot?.querySelector('.custom-widget-root');
      return {
        hasRoot: Boolean(root),
        text: (root?.textContent ?? '').trim().slice(0, 80),
      };
    });
    const ok = mounted && info.hasRoot && info.text.length > 0;
    if (ok) passed += 1;
    console.log(
      `  [${ok ? 'PASS' : 'FAIL'}] ${id}\n` +
        `        mounted=${mounted} shadowRoot=${info.hasRoot} text="${info.text}"`
    );
  }

  if (failedRequests.length > 0) {
    console.log('\nFailed requests:');
    for (const f of failedRequests) console.log(`  - ${f}`);
  }
  if (consoleErrors.length > 0) {
    console.log('\nConsole errors:');
    for (const e of consoleErrors.slice(0, 10)) console.log(`  - ${e.slice(0, 200)}`);
  }

  console.log(
    `\nRESULT: ${passed === total ? 'PASS' : 'FAIL'} — ${passed}/${total} widgets rendered`
  );
  process.exit(passed === total ? 0 : 1);
} finally {
  await browser.close();
}
