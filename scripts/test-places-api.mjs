import { config } from 'dotenv';

// Load .env.local first, fallback to .env
try {
  const envConfig = config({ path: '.env.local' });
  if (envConfig.error) throw envConfig.error;
} catch {
  config();
}

const API_KEY = process.env.GOOGLE_PLACES_API_KEY;

// Default test place: Googleplex (known to have many reviews)
const DEFAULT_PLACE_ID = 'ChIJj61dQgK6j4AR4GeTYWZsKWw';
const placeId = process.argv[2] || DEFAULT_PLACE_ID;

if (!API_KEY) {
  console.error('GOOGLE_PLACES_API_KEY is not set in .env.local');
  process.exit(1);
}

async function fetchReviews(placeId) {
  const url = new URL(`https://places.googleapis.com/v1/places/${placeId}`);
  const response = await fetch(url, {
    headers: {
      'X-Goog-Api-Key': API_KEY,
      'X-Goog-FieldMask': 'reviews,rating,userRatingCount,displayName',
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`HTTP ${response.status}: ${error}`);
  }

  return response.json();
}

console.log(`Testing Place ID: ${placeId}\n`);

try {
  const data = await fetchReviews(placeId);

  console.log('Business:', data.displayName?.text || 'N/A');
  console.log('Average rating:', data.rating ?? 'N/A');
  console.log('Total review count:', data.userRatingCount ?? 'N/A');
  console.log('Reviews returned in this call:', data.reviews?.length ?? 0);

  if (data.reviews?.length > 0) {
    console.log('\nFirst review:');
    console.log('  Author:', data.reviews[0].authorAttribution?.displayName || 'N/A');
    console.log('  Rating:', data.reviews[0].rating);
    console.log('  Text:', (data.reviews[0].text?.text || '').slice(0, 120) + '...');
  }
} catch (err) {
  console.error('Fetch failed:', err.message);
  process.exit(1);
}
