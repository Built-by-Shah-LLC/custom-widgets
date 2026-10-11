/**
 * End-to-end embed test: simulates an external site (GHL) loading
 * widget.js with the BuiltByShah snippet markup, then checks that
 * the widget fetches live data from the API and renders into Shadow DOM.
 *
 * Usage: node scripts/test-embed.mjs [widgetId] [origin]
 * origin defaults to http://localhost:3000 (dev server). Pass the deployed
 * URL to test production, e.g.:
 *   node scripts/test-embed.mjs 004a7b18-... https://custom-widgets-phi.vercel.app
 */
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const widgetId = process.argv[2] || '004a7b18-6bcc-4b2a-a8f9-454012312690';
const API_ORIGIN = process.argv[3] || 'http://localhost:3000';
const bootstrapUrl = `${API_ORIGIN}/api/embeds/widget/${widgetId}/data.js`;

// Test the bundle actually being served (deployed) when a remote origin is
// given; otherwise use the local build output.
const bundle = API_ORIGIN.startsWith('http://localhost')
  ? readFileSync('public/widget.js', 'utf8')
  : await (await fetch(`${API_ORIGIN}/widget.js`)).text();
const bootstrapResponse = await fetch(bootstrapUrl);
if (!bootstrapResponse.ok) {
  console.error(`Bootstrap fetch failed: ${bootstrapResponse.status} ${bootstrapUrl}`);
  process.exit(1);
}
const bootstrap = await bootstrapResponse.text();

if (!bundle.includes('custom-widgets') && bundle.length < 1000) {
  console.error('Bundle fetch looks wrong, got:', bundle.slice(0, 200));
  process.exit(1);
}

const html = `<!DOCTYPE html>
<html>
  <body>
    <!-- BuiltByShah Widget Embed -->
    <div data-bbs-embed="${widgetId}"></div>
    <script async src="${bootstrapUrl}"></script>
    <!-- End BuiltByShah Widget Embed -->
  </body>
</html>`;

const { VirtualConsole } = await import('jsdom');
const virtualConsole = new VirtualConsole();
const consoleMessages = [];
virtualConsole.on('error', (...a) => consoleMessages.push(['error', a.join(' ')]));
virtualConsole.on('warn', (...a) => consoleMessages.push(['warn', a.join(' ')]));
virtualConsole.on('jsdomError', (e) => consoleMessages.push(['jsdomError', e.message]));

const dom = new JSDOM(html, {
  url: 'https://ghl-hosted-site.example.com/', // external origin, like GHL
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  virtualConsole,
  beforeParse(window) {
    // jsdom has no fetch; give it Node's (no CORS enforcement, headers
    // verified separately via curl).
    window.fetch = globalThis.fetch;
    // Simulate the script having been loaded from our app.
    window.__CUSTOM_WIDGETS_API_ORIGIN__ = API_ORIGIN;
  },
});

// jsdom does not load external scripts unless its resource loader is enabled.
// Execute the fetched bootstrap manually while retaining the real script tag,
// which is also the runtime's proof that data came from the configured API
// origin.
dom.window.eval(bootstrap);
const expectedBusinessName =
  dom.window.__BBS_WIDGET_DATA__?.[widgetId]?.business?.name;

// Execute the bundle as the page's inline script would.
const scriptEl = dom.window.document.createElement('script');
scriptEl.textContent = bundle;
dom.window.document.body.appendChild(scriptEl);

// Poll for the widget to fetch + render (check the React mount point, not the
// shadow root itself — the injected <style> makes its text non-empty).
const deadline = Date.now() + 15000;
let rendered = '';
while (Date.now() < deadline) {
  const placeholder = dom.window.document.querySelector('[data-bbs-embed]');
  rendered = placeholder?.shadowRoot?.querySelector('.custom-widget-root')?.textContent ?? '';
  if (rendered.trim().length > 0) break;
  await new Promise((r) => setTimeout(r, 250));
}

console.log('--- console messages from the page ---');
for (const [level, msg] of consoleMessages) console.log(`[${level}]`, msg.slice(0, 300));
if (consoleMessages.length === 0) console.log('(none)');

console.log('\n--- rendered shadow DOM text ---');
console.log(rendered.trim() || '(nothing rendered)');

const ok =
  typeof expectedBusinessName === 'string' &&
  expectedBusinessName.length > 0 &&
  rendered.includes(expectedBusinessName);
console.log('\nRESULT:', ok ? 'PASS — widget rendered live business data' : 'FAIL');
process.exit(ok ? 0 : 1);
