'use client';

export function ReviewPhotoMigrationButton({
  loading,
  disabled,
  onClick,
}: {
  loading: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-busy={loading}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--color-accent)] bg-transparent px-4 py-2.5 text-sm font-semibold text-[var(--color-accent)] transition-[background-color,opacity,transform] hover:bg-[var(--color-bg-hover)] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading && (
          <span
            aria-hidden
            className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          />
        )}
        {loading ? 'Storing Existing Review Photos…' : 'Store Existing Review Photos'}
      </button>
      <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
        Moves this company&apos;s existing Google-hosted review photos into Supabase and verifies every stored URL.
      </p>
    </div>
  );
}
