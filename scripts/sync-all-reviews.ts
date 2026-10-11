import { config } from 'dotenv';

config({ path: '.env.local' });

const DELAY_MS = 1500; // be polite to scrape.do

async function main() {
  const { supabase } = await import('../src/lib/db');
  const { syncBusinessReviews } = await import('../src/lib/sync-reviews');

  const { data: businesses, error } = await supabase
    .from('businesses')
    .select('place_id, name')
    .order('name', { ascending: true });

  if (error || !businesses) {
    console.error('Failed to load businesses:', error?.message);
    process.exit(1);
  }

  // Optional skip list: --skip-file <path-to-json-array-of-business-names>
  const skipArg = process.argv.indexOf('--skip-file');
  const skip = new Set<string>();
  if (skipArg !== -1 && process.argv[skipArg + 1]) {
    const { readFileSync } = await import('node:fs');
    for (const n of JSON.parse(readFileSync(process.argv[skipArg + 1], 'utf-8'))) skip.add(n);
  }

  const todo = businesses.filter((b) => !skip.has(b.name));
  console.log(`Syncing ${todo.length} businesses (skipping ${businesses.length - todo.length} already synced)...\n`);

  const ok = [];
  const failed = [];

  for (const [i, b] of todo.entries()) {
    try {
      const r = await syncBusinessReviews(b.place_id, 40);
      ok.push(r);
      console.log(
        `[${i + 1}/${todo.length}] OK  ${b.name} — ${r.reviewsStored} reviews, ${r.imageStorage.storedImages} images stored, ${r.imageStorage.failedImages} image failures, ${r.widgetsUpdated} widgets`
      );
    } catch (err) {
      failed.push({ name: b.name, placeId: b.place_id, error: err instanceof Error ? err.message : String(err) });
      console.log(`[${i + 1}/${todo.length}] FAIL ${b.name} — ${failed[failed.length - 1].error}`);
    }
    if (i < todo.length - 1) await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  console.log(`\nDone. ${ok.length} synced, ${failed.length} failed.`);
  if (failed.length > 0) {
    console.log('Failures:');
    for (const f of failed) console.log(`  ${f.name} (${f.placeId}): ${f.error}`);
  }
}

main();
