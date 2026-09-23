/**
 * Production CRUD smoke test: logs into the live admin UI with a real browser
 * session and exercises the admin widget API end-to-end
 * (create -> read -> update -> read -> delete), plus reads of businesses and
 * reviews. Cleans up the test widget afterwards.
 *
 * Usage:
 *   node scripts/production-crud-check.mjs <email> <password> [baseUrl]
 *
 * baseUrl defaults to https://builtbyshahwidgets.com
 */
import { chromium } from 'playwright';

const [email, password] = process.argv.slice(2);
const baseUrl = process.argv[4] || 'https://builtbyshahwidgets.com';
if (!email || !password) {
  console.error('Usage: node scripts/production-crud-check.mjs <email> <password> [baseUrl]');
  process.exit(2);
}

const results = [];
function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? ` — ${detail}` : ''}`);
}

const browser = await chromium.launch();
const page = await browser.newPage();
let createdWidgetId = null;

try {
  // --- Login through the real UI ---
  await page.goto(`${baseUrl}/login`, { waitUntil: 'load' });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15_000 });
  record('Admin login', true, page.url());

  const api = (method, path, body) =>
    page.evaluate(
      async ({ method, path, body }) => {
        const res = await fetch(path, {
          method,
          headers: body ? { 'Content-Type': 'application/json' } : undefined,
          body: body ? JSON.stringify(body) : undefined,
        });
        let json = null;
        try { json = await res.json(); } catch { /* empty body */ }
        return { status: res.status, json };
      },
      { method, path, body }
    );

  // --- READ: widget list (need a business_id for widget creation) ---
  const list = await api('GET', '/api/v1/widget-lists?type=google-reviews&pageSize=1');
  const items = list.json?.items ?? [];
  record('READ widget list', list.status === 200 && items.length > 0,
    `status=${list.status}`);
  const businessId = items[0]?.businessId;
  if (!businessId) throw new Error('No business available for widget CRUD test');

  // --- CREATE: widget ---
  const created = await api('POST', '/api/v1/widgets', {
    business_id: businessId,
    widget_type: 'google_reviews',
    name: 'CRUD SMOKE TEST — delete me',
  });
  createdWidgetId = created.json?.id ?? created.json?.widget?.id ?? null;
  record('CREATE widget', created.status === 200 || created.status === 201,
    `id=${createdWidgetId} status=${created.status}`);

  const findInList = (id) =>
    api('GET', `/api/v1/widget-lists?type=google-reviews&search=${id}`);

  // --- READ: widget (admin list; public GET is origin-allowlisted) ---
  if (createdWidgetId) {
    const read = await findInList(createdWidgetId);
    const found = (read.json?.items ?? []).some((w) => w.id === createdWidgetId);
    record('READ widget', read.status === 200 && found, `status=${read.status} found=${found}`);

    // --- READ: widget reviews (from admin list payload) ---
    const reviewsItem = (read.json?.items ?? []).find((w) => w.id === createdWidgetId);
    record('READ widget reviews', Array.isArray(reviewsItem?.reviews),
      `cached reviews=${reviewsItem?.reviews?.length ?? 'n/a'}`);

    // --- Public embed GET must be origin-gated (security) ---
    const pubGet = await api('GET', `/api/v1/widgets/${createdWidgetId}`);
    record('Public GET origin-gated', pubGet.status === 403,
      `admin origin got ${pubGet.status} (expected 403)`);

    // --- UPDATE: rename ---
    const updated = await api('PATCH', `/api/v1/widgets/${createdWidgetId}`, {
      name: 'CRUD SMOKE TEST — renamed',
    });
    const reRead = await findInList(createdWidgetId);
    const renamed = (reRead.json?.items ?? []).some(
      (w) => w.id === createdWidgetId && w.name === 'CRUD SMOKE TEST — renamed'
    );
    record('UPDATE widget', (updated.status === 200 || updated.status === 204) && renamed,
      `patch=${updated.status} renamed=${renamed}`);

    // --- DELETE ---
    const del = await api('DELETE', `/api/v1/widgets/${createdWidgetId}`);
    const gone = await findInList(createdWidgetId);
    const stillThere = (gone.json?.items ?? []).some((w) => w.id === createdWidgetId);
    record('DELETE widget', (del.status === 200 || del.status === 204) && !stillThere,
      `delete=${del.status} stillListed=${stillThere}`);
    createdWidgetId = null; // cleaned up
  }

  // --- READ: allowed domains ---
  const domains = await api('GET', '/api/v1/allowed-domains');
  record('READ allowed-domains', domains.status === 200, `status=${domains.status}`);
} catch (err) {
  record('flow completed without exception', false, err.message);
} finally {
  // Best-effort cleanup if the delete step didn't run.
  if (createdWidgetId) {
    try {
      await page.evaluate(async (id) => {
        await fetch(`/api/v1/widgets/${id}`, { method: 'DELETE' });
      }, createdWidgetId);
      console.log('  (cleanup) deleted leftover test widget', createdWidgetId);
    } catch { /* ignore */ }
  }
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\nRESULT: ${failed.length === 0 ? 'PASS' : 'FAIL'} — ${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
