import { REVIEW_IMAGES_BUCKET } from './review-image-storage';

type StorageError = {
  status?: number;
  statusCode?: string;
  code?: string;
};

export interface VerifiedReviewImageUploadInput {
  path: string;
  bytes: Uint8Array;
  contentType: string;
  cacheControl: string;
}

interface StorageBucket {
  upload: (
    path: string,
    bytes: Uint8Array,
    options: { cacheControl: string; contentType: string; upsert: boolean },
  ) => PromiseLike<{ error: StorageError | null }>;
  download: (path: string) => PromiseLike<{ data: Blob | null; error: { message: string } | null }>;
  getPublicUrl: (path: string) => { data: { publicUrl: string } };
}

interface VerifiedUploadDependencies {
  bucket?: StorageBucket;
  fetchImpl?: typeof fetch;
  supabaseUrl?: string;
}

function isExistingStorageObject(error: StorageError): boolean {
  return error.status === 409
    || error.statusCode === '409'
    || error.code === 'Duplicate'
    || error.code === 'ResourceAlreadyExists';
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  return left.every((value, index) => value === right[index]);
}

function normalizeContentType(value: string | null): string {
  return (value ?? '').split(';', 1)[0].trim().toLowerCase();
}

export async function uploadVerifiedReviewImage(
  input: VerifiedReviewImageUploadInput,
  dependencies: VerifiedUploadDependencies = {},
): Promise<string> {
  const bucket = dependencies.bucket
    ?? (await import('./db')).supabase.storage.from(REVIEW_IMAGES_BUCKET) as unknown as StorageBucket;
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const configuredSupabaseUrl = dependencies.supabaseUrl ?? process.env.SUPABASE_URL;
  if (!configuredSupabaseUrl) throw new Error('SUPABASE_URL not configured');

  const { error: uploadError } = await bucket.upload(input.path, input.bytes, {
    cacheControl: input.cacheControl,
    contentType: input.contentType,
    upsert: false,
  });
  if (uploadError && !isExistingStorageObject(uploadError)) throw uploadError;

  const { data: downloaded, error: downloadError } = await bucket.download(input.path);
  if (downloadError || !downloaded) {
    throw new Error(downloadError?.message ?? 'Stored review image could not be downloaded for verification');
  }
  const storedBytes = new Uint8Array(await downloaded.arrayBuffer());
  if (!sameBytes(input.bytes, storedBytes)) {
    throw new Error('Stored review image bytes do not match the downloaded Google image');
  }

  const { data } = bucket.getPublicUrl(input.path);
  const publicUrl = new URL(data.publicUrl);
  const supabaseUrl = new URL(configuredSupabaseUrl);
  const expectedPath = `/storage/v1/object/public/${REVIEW_IMAGES_BUCKET}/`;
  if (
    publicUrl.protocol !== 'https:'
    || publicUrl.origin !== supabaseUrl.origin
    || !publicUrl.pathname.startsWith(expectedPath)
  ) {
    throw new Error('Review image upload returned an unexpected public URL');
  }

  const publicResponse = await fetchImpl(publicUrl, {
    cache: 'no-store',
    redirect: 'error',
    headers: { Accept: input.contentType },
  });
  if (!publicResponse.ok) {
    await publicResponse.body?.cancel();
    throw new Error(`Stored review image public URL returned HTTP ${publicResponse.status}`);
  }
  if (normalizeContentType(publicResponse.headers.get('content-type')) !== input.contentType) {
    await publicResponse.body?.cancel();
    throw new Error('Stored review image public URL returned the wrong content type');
  }
  const publicBytes = new Uint8Array(await publicResponse.arrayBuffer());
  if (!sameBytes(input.bytes, publicBytes)) {
    throw new Error('Stored review image public URL returned different image bytes');
  }

  return publicUrl.href;
}
