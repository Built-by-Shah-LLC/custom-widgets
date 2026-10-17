import { describe, expect, it, vi } from 'vitest';
import { uploadVerifiedReviewImage } from './verified-review-image-upload';

const bytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const publicUrl = 'https://project.supabase.co/storage/v1/object/public/review-images/business/review/photo.jpg';

function bucket(storedBytes = bytes, uploadError: Record<string, unknown> | null = null) {
  return {
    upload: vi.fn(async () => ({ error: uploadError })),
    download: vi.fn(async () => ({ data: new Blob([storedBytes]), error: null })),
    getPublicUrl: vi.fn(() => ({ data: { publicUrl } })),
  };
}

describe('verified review image upload', () => {
  it('accepts an existing immutable object only after bucket and public bytes match', async () => {
    const storage = bucket(bytes, { statusCode: '409' });
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(bytes, {
      status: 200,
      headers: { 'Content-Type': 'image/jpeg' },
    }));

    await expect(uploadVerifiedReviewImage({
      path: 'business/review/photo.jpg',
      bytes,
      contentType: 'image/jpeg',
      cacheControl: '31536000',
    }, {
      bucket: storage,
      fetchImpl,
      supabaseUrl: 'https://project.supabase.co',
    })).resolves.toBe(publicUrl);

    expect(storage.upload).toHaveBeenCalledWith(
      'business/review/photo.jpg',
      bytes,
      { cacheControl: '31536000', contentType: 'image/jpeg', upsert: false },
    );
    expect(storage.download).toHaveBeenCalledWith('business/review/photo.jpg');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('rejects an object whose stored bytes differ from the Google download', async () => {
    await expect(uploadVerifiedReviewImage({
      path: 'business/review/photo.jpg',
      bytes,
      contentType: 'image/jpeg',
      cacheControl: '31536000',
    }, {
      bucket: bucket(Uint8Array.from([1, 2, 3])),
      fetchImpl: vi.fn(),
      supabaseUrl: 'https://project.supabase.co',
    })).rejects.toThrow('Stored review image bytes do not match');
  });

  it('rejects a public URL that does not serve the exact uploaded image', async () => {
    await expect(uploadVerifiedReviewImage({
      path: 'business/review/photo.jpg',
      bytes,
      contentType: 'image/jpeg',
      cacheControl: '31536000',
    }, {
      bucket: bucket(),
      fetchImpl: vi.fn(async () => new Response(Uint8Array.from([0xff, 0xd8, 0xff, 9]), {
        status: 200,
        headers: { 'Content-Type': 'image/jpeg' },
      })),
      supabaseUrl: 'https://project.supabase.co',
    })).rejects.toThrow('public URL returned different image bytes');
  });

  it('rejects public URLs outside the configured Supabase project and bucket', async () => {
    const storage = bucket();
    storage.getPublicUrl.mockReturnValue({
      data: { publicUrl: 'https://evil.example/storage/v1/object/public/review-images/photo.jpg' },
    });

    await expect(uploadVerifiedReviewImage({
      path: 'business/review/photo.jpg',
      bytes,
      contentType: 'image/jpeg',
      cacheControl: '31536000',
    }, {
      bucket: storage,
      fetchImpl: vi.fn(),
      supabaseUrl: 'https://project.supabase.co',
    })).rejects.toThrow('unexpected public URL');
  });
});
