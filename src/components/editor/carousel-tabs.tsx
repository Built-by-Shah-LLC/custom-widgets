'use client';

import { useEffect, useState } from 'react';
import type { WidgetConfig } from '@/lib/widget-config';
import type { BusinessInfo, Review } from '@/lib/reviews-data';
import {
  Card,
  ColorField,
  Field,
  NumberInput,
  Section,
  Select,
  Slider,
  TextInput,
  Toggle,
} from './controls';
import { ExcludeReviewsPicker } from './ExcludeReviewsPicker';
import { ReviewFetchButton } from './ReviewFetchButton';
import { ReviewPhotoMigrationButton } from './ReviewPhotoMigrationButton';
import type { BusinessOption } from './tabs';
import type { ReviewLoadStatus } from './review-sync-status';

export interface CarouselTabProps {
  config: WidgetConfig;
  update: <K extends keyof WidgetConfig>(key: K, value: WidgetConfig[K]) => void;
  widgetName: string;
  onNameChange: (name: string) => void;
  business?: BusinessInfo;
  reviews: Review[];
  businesses?: BusinessOption[];
  selectedBusinessId?: string;
  onSelectBusiness?: (business: BusinessOption) => void | Promise<void>;
  reviewLoadStatus?: ReviewLoadStatus | null;
  hasReviews?: boolean;
  reviewFetching?: boolean;
  onFetchReviews?: () => void | Promise<void>;
  photoMigrationStatus?: ReviewLoadStatus | null;
  photoMigrating?: boolean;
  onMigrateReviewPhotos?: () => void | Promise<void>;
}

// ---------------------------------------------------------------------------
// Content tab
// ---------------------------------------------------------------------------

export function ContentTab({
  config,
  update,
  widgetName,
  onNameChange,
  business,
  reviews,
  businesses = [],
  selectedBusinessId,
  onSelectBusiness,
  reviewLoadStatus,
  hasReviews = false,
  reviewFetching = false,
  onFetchReviews,
  photoMigrationStatus,
  photoMigrating = false,
  onMigrateReviewPhotos,
}: CarouselTabProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');
  const [remoteBusinesses, setRemoteBusinesses] = useState<BusinessOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');

  useEffect(() => {
    const query = pickerQuery.trim();
    if (!pickerOpen || query.length < 3) {
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true); setSearchError('');
      try {
        const response = await fetch(`/api/v1/businesses/search?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? 'Search failed');
        setRemoteBusinesses(payload.results ?? []);
      } catch (error) {
        if (!controller.signal.aborted) setSearchError(error instanceof Error ? error.message : 'Search failed');
      } finally { if (!controller.signal.aborted) setSearching(false); }
    }, 700);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [pickerOpen, pickerQuery]);

  const q = pickerQuery.trim().toLowerCase();
  const filteredBusinesses = q
    ? businesses.filter(
        (b) => b.name.toLowerCase().includes(q) || b.address.toLowerCase().includes(q)
      )
    : businesses;
  const displayedBusinesses = q.length >= 3 ? remoteBusinesses : filteredBusinesses;
  const isSearching = q.length >= 3 && searching;
  const visibleSearchError = q.length >= 3 ? searchError : '';

  return (
    <>
      <Section title="Name">
        <Card>
          <TextInput value={widgetName} onChange={onNameChange} placeholder="Widget name" />
        </Card>
      </Section>

      <Section title="Google Business">
        <Card>
          <div className="relative flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${selectedBusinessId ? 'bg-emerald-100 text-emerald-700' : 'bg-[var(--color-bg-secondary)] text-[var(--color-text-muted)]'}`}>
                {selectedBusinessId ? (
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" />
                  </svg>
                )}
              </span>
              <div className="min-w-0">
                <div className="text-sm font-semibold break-words text-[var(--color-text-primary)]">
                  {selectedBusinessId ? (business?.name || 'Business') : 'No business selected'}
                </div>
                <div className="truncate text-xs text-[var(--color-text-secondary)]">{business?.address ?? ''}</div>
                {reviewLoadStatus && (
                  <div className={`mt-1 flex items-center gap-1.5 text-xs ${reviewLoadStatus.state === 'error' ? 'text-[var(--color-danger)]' : reviewLoadStatus.state === 'partial' ? 'text-amber-700' : reviewLoadStatus.state === 'complete' ? 'text-emerald-700' : 'text-[var(--color-text-secondary)]'}`}>
                    {reviewLoadStatus.state === 'loading' && <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />}
                    {reviewLoadStatus.state === 'complete' && <span aria-hidden>✓</span>}
                    {reviewLoadStatus.state === 'partial' && <span aria-hidden>!</span>}
                    {reviewLoadStatus.message}
                  </div>
                )}
                {photoMigrationStatus && (
                  <div className={`mt-1 flex items-center gap-1.5 text-xs ${photoMigrationStatus.state === 'error' ? 'text-[var(--color-danger)]' : photoMigrationStatus.state === 'partial' ? 'text-amber-700' : photoMigrationStatus.state === 'complete' ? 'text-emerald-700' : 'text-[var(--color-text-secondary)]'}`}>
                    {photoMigrationStatus.state === 'loading' && <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />}
                    {photoMigrationStatus.state === 'complete' && <span aria-hidden>✓</span>}
                    {photoMigrationStatus.state === 'partial' && <span aria-hidden>!</span>}
                    {photoMigrationStatus.message}
                  </div>
                )}
              </div>
            </div>
            <button
              type="button"
              disabled={reviewLoadStatus?.state === 'loading' || photoMigrating}
              onClick={() => {
                setPickerOpen((o) => !o);
                setPickerQuery('');
              }}
              className="flex-shrink-0 self-start text-sm text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {selectedBusinessId ? 'Change' : 'Choose'}
            </button>

            {pickerOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setPickerOpen(false)} />
                <div
                  className="absolute top-full right-0 z-50 mt-2 w-72 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] shadow-lg"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="p-2.5">
                    <input
                      type="text"
                      value={pickerQuery}
                      onChange={(e) => setPickerQuery(e.target.value)}
                      placeholder="Search businesses..."
                      autoFocus
                      className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none transition-[border-color,box-shadow] duration-[var(--duration-base)] ease-[var(--ease-out)] focus:border-[var(--color-accent)] focus:shadow-[var(--shadow-glow)] placeholder:text-[var(--color-text-muted)]"
                    />
                  </div>
                  <div className="editor-scroll max-h-64 overflow-y-auto p-1.5">
                    {isSearching && <div className="p-4 text-center text-sm text-[var(--color-text-secondary)]">Searching Google Maps…</div>}
                    {visibleSearchError && <div className="p-4 text-center text-sm text-[var(--color-danger)]">{visibleSearchError}</div>}
                    {!isSearching && !visibleSearchError && displayedBusinesses.length === 0 && (
                      <div className="p-4 text-center text-sm text-[var(--color-text-secondary)]">
                        {businesses.length === 0
                          ? 'Type at least 3 characters to search Google Maps.'
                          : q.length < 3 ? 'No saved businesses match your search.' : 'No Google Maps businesses found.'}
                      </div>
                    )}
                    {displayedBusinesses.map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={async () => {
                          setPickerOpen(false);
                          await onSelectBusiness?.(b);
                        }}
                        className={`flex w-full items-center justify-between gap-2 rounded-lg p-3 text-left transition-colors hover:bg-[var(--color-bg-hover)] ${b.id === selectedBusinessId ? 'bg-[var(--color-bg-hover)]' : ''
                          }`}
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-[var(--color-text-primary)]">{b.name}</div>
                          <div className="truncate text-xs text-[var(--color-text-secondary)]">{b.address}</div>
                        </div>
                        {b.id === selectedBusinessId && (
                          <svg className="h-4 w-4 flex-shrink-0 text-[var(--color-accent)]" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                            <path d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
          {selectedBusinessId && onFetchReviews && (
            <ReviewFetchButton
              hasReviews={hasReviews}
              loading={reviewFetching}
              disabled={reviewLoadStatus?.state === 'loading' || photoMigrating}
              onClick={() => void onFetchReviews()}
            />
          )}
          {selectedBusinessId && onMigrateReviewPhotos && (
            <ReviewPhotoMigrationButton
              loading={photoMigrating}
              disabled={photoMigrating || reviewFetching || reviewLoadStatus?.state === 'loading'}
              onClick={() => void onMigrateReviewPhotos()}
            />
          )}
        </Card>
      </Section>

      <Section title="Filtering">
        <Card>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Sort By">
              <Select
                value={config.sortBy}
                onChange={(v) => update('sortBy', v as WidgetConfig['sortBy'])}
                options={[
                  { value: 'highest_rating', label: 'Highest Rating' },
                  { value: 'lowest_rating', label: 'Lowest Rating' },
                  { value: 'newest', label: 'Newest' },
                  { value: 'oldest', label: 'Oldest' },
                  { value: 'most_relevant', label: 'Most Relevant' },
                ]}
              />
            </Field>
            <Field label="Min Rating">
              <Select
                value={String(config.minRating)}
                onChange={(v) => update('minRating', Number(v))}
                options={[
                  { value: '5', label: '5 Stars Only' },
                  { value: '4', label: '4 Stars & Up' },
                  { value: '3', label: '3 Stars & Up' },
                  { value: '2', label: '2 Stars & Up' },
                  { value: '1', label: 'All Ratings' },
                ]}
              />
            </Field>
            <Field label="Image Filtering">
              <Select
                value={config.imageFiltering}
                onChange={(v) => update('imageFiltering', v as WidgetConfig['imageFiltering'])}
                options={[
                  { value: 'images_first', label: 'Images First' },
                  { value: 'images_only', label: 'Images Only' },
                  { value: 'no_images', label: 'No Images' },
                  { value: 'all', label: 'All Reviews' },
                ]}
              />
            </Field>
            <Field label="Max Reviews">
              <NumberInput
                value={config.maxReviews}
                min={1}
                max={100}
                onChange={(v) => update('maxReviews', v)}
              />
            </Field>
          </div>
          <div className="mt-4">
            <Field label="Exclude Reviews">
              <ExcludeReviewsPicker
                reviews={reviews}
                minRating={config.minRating}
                maxReviews={config.maxReviews}
                excludedIds={config.excludedReviewIds}
                onChange={(ids) => update('excludedReviewIds', ids)}
              />
            </Field>
          </div>
        </Card>
      </Section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Style tab
// ---------------------------------------------------------------------------

export function StyleTab({ config, update }: CarouselTabProps) {
  return (
    <>
      <Section title="Theme">
        <Card>
          <Toggle
            checked={config.useSiteTheme}
            onChange={(v) => update('useSiteTheme', v)}
            label="Use Site Theme"
            description="Apply your website's theme colors"
          />
        </Card>
      </Section>

      <Section title="Colors">
        <Card>
          <Field label="Background">
            <Select
              value={config.badgeBackgroundType}
              onChange={(v) => update('badgeBackgroundType', v as WidgetConfig['badgeBackgroundType'])}
              options={[
                { value: 'transparent', label: 'Transparent' },
                { value: 'solid', label: 'Solid' },
              ]}
            />
          </Field>
          {config.badgeBackgroundType === 'solid' && (
            <ColorField
              label="Background Color"
              value={config.badgeBackgroundColor}
              onChange={(v) => update('badgeBackgroundColor', v)}
            />
          )}
          <div className="grid grid-cols-2 gap-4">
            <ColorField
              label="Card Background"
              value={config.drawerCardBackgroundColor}
              onChange={(v) => update('drawerCardBackgroundColor', v)}
            />
            <ColorField
              label="Card Border"
              value={config.drawerCardBorderColor}
              onChange={(v) => update('drawerCardBorderColor', v)}
            />
            <ColorField
              label="Primary Color"
              value={config.starColor}
              onChange={(v) => update('starColor', v)}
            />
            <ColorField
              label="Text Color"
              value={config.textColor}
              onChange={(v) => update('textColor', v)}
            />
          </div>
        </Card>
      </Section>

      <Section title="Typography & Shape">
        <Card>
          <Field label="Font Family">
            <Select
              value={config.fontFamily}
              onChange={(v) => update('fontFamily', v)}
              options={[
                { value: 'inherit', label: 'Inherit from Website' },
                { value: 'system-ui', label: 'System Default' },
                { value: 'Poppins', label: 'Poppins' },
                { value: 'Inter', label: 'Inter' },
                { value: 'Roboto', label: 'Roboto' },
                { value: 'Open Sans', label: 'Open Sans' },
                { value: 'Lato', label: 'Lato' },
                { value: 'Montserrat', label: 'Montserrat' },
                { value: 'Arial', label: 'Arial' },
              ]}
            />
          </Field>
          <Slider
            label="Border Radius"
            value={config.drawerCardRadius}
            min={0}
            max={40}
            onChange={(v) => update('drawerCardRadius', v)}
          />
        </Card>
      </Section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Layout tab
// ---------------------------------------------------------------------------

export function LayoutTab({ config, update }: CarouselTabProps) {
  return (
    <>
      <Section title="Size">
        <Card>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Width Type">
              <Select
                value={config.carouselWidthType}
                onChange={(v) => update('carouselWidthType', v as WidgetConfig['carouselWidthType'])}
                options={[
                  { value: 'percentage', label: 'Percentage (%)' },
                  { value: 'fixed', label: 'Fixed (px)' },
                ]}
              />
            </Field>
            <Field label={config.carouselWidthType === 'fixed' ? 'Value (px)' : 'Value (%)'}>
              <NumberInput
                value={config.carouselWidthValue}
                min={1}
                max={config.carouselWidthType === 'fixed' ? undefined : 100}
                onChange={(v) => update('carouselWidthValue', v)}
              />
            </Field>
          </div>
          <Field label="Reviews Per Slide">
            <NumberInput
              value={config.carouselReviewsPerSlide}
              min={1}
              max={10}
              onChange={(v) => update('carouselReviewsPerSlide', v)}
            />
          </Field>
          <Toggle
            checked={config.carouselMaxWidthEnabled}
            onChange={(v) => update('carouselMaxWidthEnabled', v)}
            label="Cap Max Width"
            description="Off by default — the carousel fills its parent. Turn on only if you want a pixel ceiling."
          />
          {config.carouselMaxWidthEnabled && (
            <Slider
              label="Max Width"
              value={config.carouselMaxWidth}
              min={400}
              max={2000}
              onChange={(v) => update('carouselMaxWidth', v)}
            />
          )}
        </Card>
      </Section>

      <Section title="Spacing">
        <Card>
          <Slider
            label="Card Padding"
            value={config.carouselCardPadding}
            min={0}
            max={48}
            onChange={(v) => update('carouselCardPadding', v)}
          />
          <Slider
            label="Card Gap"
            value={config.carouselCardGap}
            min={0}
            max={48}
            onChange={(v) => update('carouselCardGap', v)}
          />
          <Slider
            label="Text Max Height"
            value={config.carouselTextMaxHeight}
            min={80}
            max={600}
            onChange={(v) => update('carouselTextMaxHeight', v)}
          />
        </Card>
      </Section>

      <Section title="Auto-Play">
        <Card>
          <Toggle
            checked={config.carouselAutoplay}
            onChange={(v) => update('carouselAutoplay', v)}
            label="Enable"
            description="Automatically advance slides every few seconds"
          />
        </Card>
      </Section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Settings tab
// ---------------------------------------------------------------------------

export function SettingsTab({ config, update }: CarouselTabProps) {
  return (
    <>
      <Section title="Display">
        <Card>
          <Toggle
            checked={config.drawerShowBusinessInfo}
            onChange={(v) => update('drawerShowBusinessInfo', v)}
            label="Business Info"
          />
          <Toggle
            checked={config.carouselShowOverallRating}
            onChange={(v) => update('carouselShowOverallRating', v)}
            label="Overall Rating"
          />
          <Toggle
            checked={config.drawerShowStarRatings}
            onChange={(v) => update('drawerShowStarRatings', v)}
            label="Star Ratings"
          />
          <Toggle
            checked={config.drawerShowDates}
            onChange={(v) => update('drawerShowDates', v)}
            label="Dates"
          />
          <Toggle
            checked={config.drawerShowAuthorPhotos}
            onChange={(v) => update('drawerShowAuthorPhotos', v)}
            label="Author Photos"
          />
          <Toggle
            checked={config.drawerShowReviewImages}
            onChange={(v) => update('drawerShowReviewImages', v)}
            label="Review Images"
          />
        </Card>
      </Section>

      <Section title="Thumbnail Size">
        <Card>
          <Select
            value={config.thumbnailSize}
            onChange={(v) => update('thumbnailSize', v as WidgetConfig['thumbnailSize'])}
            options={[
              { value: 'small', label: 'Small (40×40)' },
              { value: 'medium', label: 'Medium (60×60)' },
              { value: 'large', label: 'Large (80×80)' },
            ]}
          />
        </Card>
      </Section>
    </>
  );
}
