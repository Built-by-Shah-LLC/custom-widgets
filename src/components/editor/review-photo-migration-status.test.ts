import { describe, expect, it } from 'vitest';
import { reviewPhotoMigrationStatus } from './review-photo-migration-status';

describe('review photo migration status', () => {
  it('reports a verified successful migration', () => {
    expect(reviewPhotoMigrationStatus({
      candidateImages: 4,
      storedImages: 4,
      verifiedImages: 4,
      remainingGoogleImages: 0,
      complete: true,
    })).toEqual({
      state: 'complete',
      message: '4 existing review photos stored in Supabase and byte-verified.',
    });
  });

  it('explains when a 403 caused one refresh and retry', () => {
    const status = reviewPhotoMigrationStatus({
      candidateImages: 2,
      storedImages: 2,
      verifiedImages: 2,
      remainingGoogleImages: 0,
      refreshTriggered: true,
      complete: true,
    });

    expect(status.state).toBe('complete');
    expect(status.message).toContain('403 response triggered one review refresh and retry');
  });

  it('reports remaining URLs and refresh errors as partial', () => {
    expect(reviewPhotoMigrationStatus({
      candidateImages: 3,
      storedImages: 2,
      verifiedImages: 2,
      remainingGoogleImages: 1,
      refreshTriggered: true,
      refreshError: 'provider unavailable',
      complete: false,
    })).toEqual({
      state: 'partial',
      message: '2 photos stored and verified; 1 Google URLs remain. Refresh retry failed: provider unavailable',
    });
  });

  it('reports a deleted Google photo as removed instead of stored', () => {
    expect(reviewPhotoMigrationStatus({
      candidateImages: 1,
      storedImages: 0,
      verifiedImages: 0,
      removedUnavailableImages: 1,
      remainingGoogleImages: 0,
      refreshTriggered: true,
      complete: true,
    })).toEqual({
      state: 'complete',
      message: '0 existing review photos stored in Supabase and byte-verified; 1 confirmed unavailable Google photo was removed. A 403 response triggered one review refresh and retry.',
    });
  });
});
