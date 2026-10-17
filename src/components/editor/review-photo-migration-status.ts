import type { ReviewLoadStatus } from './review-sync-status';

interface ReviewPhotoMigrationResult {
  candidateImages?: number;
  storedImages?: number;
  verifiedImages?: number;
  remainingGoogleImages?: number;
  refreshTriggered?: boolean;
  refreshError?: string;
  complete?: boolean;
}

export function reviewPhotoMigrationStatus(
  result: ReviewPhotoMigrationResult,
): ReviewLoadStatus {
  const candidates = Number(result.candidateImages ?? 0);
  const stored = Number(result.storedImages ?? 0);
  const verified = Number(result.verifiedImages ?? 0);
  const remaining = Number(result.remainingGoogleImages ?? 0);
  const refreshNote = result.refreshTriggered
    ? ' A 403 response triggered one review refresh and retry.'
    : '';

  if (result.refreshError) {
    return {
      state: 'partial',
      message: `${stored} photos stored and verified; ${remaining} Google URLs remain. Refresh retry failed: ${result.refreshError}`,
    };
  }
  if (candidates === 0) {
    return {
      state: 'complete',
      message: 'No existing Google-hosted review photos need migration.',
    };
  }
  if (result.complete === false || remaining > 0 || verified !== stored) {
    return {
      state: 'partial',
      message: `${stored} of ${candidates} photos stored and verified; ${remaining} Google URLs remain.${refreshNote}`,
    };
  }
  return {
    state: 'complete',
    message: `${stored} existing review photos stored in Supabase and byte-verified.${refreshNote}`,
  };
}
