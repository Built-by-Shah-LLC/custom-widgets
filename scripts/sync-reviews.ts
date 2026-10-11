import { config } from 'dotenv';

config({ path: '.env.local' });

const placeId = process.argv[2] || process.env.SSR_PLACE_ID;

async function main() {
  if (!placeId) {
    console.error('Usage: npx tsx scripts/sync-reviews.ts [PLACE_ID]');
    console.error('Defaults to SSR_PLACE_ID from .env.local');
    process.exit(1);
  }

  const { syncBusinessReviews } = await import('../src/lib/sync-reviews');

  console.log(`Syncing reviews for ${placeId}...\n`);

  try {
    const result = await syncBusinessReviews(placeId, 40);
    console.log('Business:', result.businessName);
    console.log('Average rating (Google):', result.averageRating);
    console.log('Total reviews (Google):', result.totalReviews);
    console.log('Scrape.do pages fetched:', result.pagesFetched);
    console.log('Reviews stored:', result.reviewsStored);
    console.log('Review images stored in Supabase:', result.imageStorage.storedImages);
    console.log('Review image capture failures:', result.imageStorage.failedImages);
    console.log('Previous review image URLs preserved:', result.imageStorage.preservedImages);
    console.log('Widgets updated:', result.widgetsUpdated);
    console.log('Synced at:', result.syncedAt);
  } catch (err) {
    console.error('Sync failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main();
