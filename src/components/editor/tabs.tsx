'use client';

import { useEffect, useState } from 'react';
import type { Review } from '@/lib/reviews-data';
import type { WidgetConfig } from '@/lib/widget-config';
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
import type { ReviewLoadStatus } from './review-sync-status';

export interface BusinessOption {
  id: string;
  name: string;
  address: string;
  placeId?: string;
  dataId?: string;
  averageRating?: number;
  totalReviews?: number;
  source?: 'google';
}

export interface TabProps {
  config: WidgetConfig;
  update: <K extends keyof WidgetConfig>(key: K, value: WidgetConfig[K]) => void;
  businessName?: string;
  businessAddress?: string;
  reviews?: Review[];
  businesses?: BusinessOption[];
  selectedBusinessId?: string;
  onSelectBusiness?: (business: BusinessOption) => void | Promise<void>;
  widgetName: string;
  onNameChange: (name: string) => void;
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
  businessName,
  businessAddress,
  reviews = [],
  businesses = [],
  selectedBusinessId,
  onSelectBusiness,
  widgetName,
  onNameChange,
  reviewLoadStatus,
  hasReviews = false,
  reviewFetching = false,
  onFetchReviews,
  photoMigrationStatus,
  photoMigrating = false,
  onMigrateReviewPhotos,
}: TabProps) {
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
      setSearching(true);
      setSearchError('');
      try {
        const response = await fetch(`/api/v1/businesses/search?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? 'Search failed');
        setRemoteBusinesses(payload.results ?? []);
      } catch (error) {
        if (!controller.signal.aborted) setSearchError(error instanceof Error ? error.message : 'Search failed');
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
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
                <div className="text-sm font-semibold break-words text-[var(--color-text-primary)]">{selectedBusinessId ? (businessName || 'Business') : 'No business selected'}</div>
                <div className="truncate text-xs text-[var(--color-text-secondary)]">{businessAddress ?? ''}</div>
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

      <Section title="Custom Business Name" description="Override the name from Google">
        <Card>
          <Toggle
            checked={config.customBusinessNameEnabled}
            onChange={(v) => update('customBusinessNameEnabled', v)}
            label="Custom Business Name"
          />
          {config.customBusinessNameEnabled && (
            <div className="mt-3">
              <TextInput
                value={config.customBusinessName}
                onChange={(v) => update('customBusinessName', v)}
                placeholder="Enter custom business name"
              />
            </div>
          )}
        </Card>
      </Section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Style tab
// ---------------------------------------------------------------------------
export function StyleTab({ config, update }: TabProps) {
  return (
    <>
      <Section title="">
        <Card>
          <Toggle
            checked={config.useSiteTheme}
            onChange={(v) => update('useSiteTheme', v)}
            label="Use Site Theme"
            description="Apply your website's theme colors"
          />
        </Card>
      </Section>

      <Section title="Badge Colors">
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
          <div className="grid grid-cols-2 gap-4">
            <ColorField
              label="Badge Background"
              value={config.badgeBackgroundColor}
              onChange={(v) => update('badgeBackgroundColor', v)}
            />
            <ColorField
              label="Badge Border"
              value={config.badgeBorderColor}
              onChange={(v) => update('badgeBorderColor', v)}
            />
            <ColorField label="Star Color" value={config.starColor} onChange={(v) => update('starColor', v)} />
            <ColorField label="Text Color" value={config.textColor} onChange={(v) => update('textColor', v)} />
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
          <Slider label="Border Radius" value={config.borderRadius} min={0} max={40} onChange={(v) => update('borderRadius', v)} />
          <Slider label="Padding" value={config.padding} min={0} max={40} onChange={(v) => update('padding', v)} />
        </Card>
      </Section>

      <Section title="Sizing">
        <Card>
          <Slider label="Star Size" value={config.starSize} min={12} max={48} onChange={(v) => update('starSize', v)} />
          <Slider label="Google Icon" value={config.googleIconSize} min={12} max={48} onChange={(v) => update('googleIconSize', v)} />
        </Card>
      </Section>

      <Section title="Call to Action">
        <Card>
          <Toggle checked={config.ctaEnabled} onChange={(v) => update('ctaEnabled', v)} label="Enable CTA" />
          {config.ctaEnabled && (
            <div className="mt-3">
              <Field label="Text">
                <TextInput value={config.ctaText} onChange={(v) => update('ctaText', v)} />
              </Field>
              <Toggle
                checked={config.ctaShowGoogleLogo}
                onChange={(v) => update('ctaShowGoogleLogo', v)}
                label="Show Google logo"
              />
            </div>
          )}
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ColorField label="Background" value={config.ctaBackgroundColor} onChange={(v) => update('ctaBackgroundColor', v)} />
            <ColorField label="Text Color" value={config.ctaTextColor} onChange={(v) => update('ctaTextColor', v)} />
          </div>
        </Card>
      </Section>

      <Section title="Popup">
        <Card>
          <div className="grid grid-cols-2 gap-4">
            <ColorField label="Background" value={config.drawerBackgroundColor} onChange={(v) => update('drawerBackgroundColor', v)} />
            <ColorField label="Text Color" value={config.drawerTextColor} onChange={(v) => update('drawerTextColor', v)} />
            <ColorField label="Divider" value={config.drawerCardBorderColor} onChange={(v) => update('drawerCardBorderColor', v)} />
          </div>
        </Card>
      </Section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Layout tab
// ---------------------------------------------------------------------------
export function LayoutTab({ config, update }: TabProps) {
  return (
    <>
      <Section title="Position">
        <Card>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Layout">
              <Select
                value={config.layout}
                onChange={(v) => update('layout', v as WidgetConfig['layout'])}
                options={[
                  { value: 'centered', label: 'Centered' },
                  { value: 'horizontal', label: 'Horizontal' },
                ]}
              />
            </Field>
            <Field label="Position">
              <Select
                value={config.position}
                onChange={(v) => update('position', v as WidgetConfig['position'])}
                options={[
                  { value: 'inline', label: 'Inline' },
                  { value: 'fixed', label: 'Fixed' },
                  { value: 'absolute', label: 'Absolute' },
                ]}
              />
            </Field>
          </div>
          <div className="my-4">
            <Field label="Alignment">
              <Select
                value={config.alignment}
                onChange={(v) => update('alignment', v as WidgetConfig['alignment'])}
                options={[
                  { value: 'center', label: 'Center' },
                  { value: 'left', label: 'Left' },
                  { value: 'right', label: 'Right' },
                ]}
              />
            </Field>
          </div>
          <Toggle checked={config.fullWidth} onChange={(v) => update('fullWidth', v)} label="Full Width" />
        </Card>
      </Section>

    </>
  );
}

// ---------------------------------------------------------------------------
// Settings tab
// ---------------------------------------------------------------------------
export function SettingsTab({ config, update }: TabProps) {
  return (
    <>
      <Section title="Badge Display">
        <Card>
          <Toggle checked={config.badgeShowBusinessName} onChange={(v) => update('badgeShowBusinessName', v)} label="Business Name" />
          <Toggle checked={config.badgeShowReviewCount} onChange={(v) => update('badgeShowReviewCount', v)} label="Review Count" />
          <Toggle checked={config.badgeCompactMode} onChange={(v) => update('badgeCompactMode', v)} label="Compact Mode" />
        </Card>
      </Section>

      <Section title="Popup Display">
        <Card>
          <Toggle checked={config.drawerShowBusinessInfo} onChange={(v) => update('drawerShowBusinessInfo', v)} label="Business Info" />
          <Toggle checked={config.drawerShowStarRatings} onChange={(v) => update('drawerShowStarRatings', v)} label="Star Ratings" />
          <Toggle checked={config.drawerShowDates} onChange={(v) => update('drawerShowDates', v)} label="Dates" />
          <Toggle checked={config.drawerShowAuthorPhotos} onChange={(v) => update('drawerShowAuthorPhotos', v)} label="Author Photos" />
          <Toggle checked={config.drawerShowReviewImages} onChange={(v) => update('drawerShowReviewImages', v)} label="Review Images" />
        </Card>
      </Section>

      <Section title="Author Photo Size">
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

      <Section title="Review Photo Size">
        <Card>
          <Select
            value={config.reviewImageSize}
            onChange={(v) => update('reviewImageSize', v as WidgetConfig['reviewImageSize'])}
            options={[
              { value: 'small', label: 'Small (40×40)' },
              { value: 'medium', label: 'Medium (60×60)' },
              { value: 'large', label: 'Large (80×80)' },
              { value: 'xl', label: 'XL (100×100)' },
            ]}
          />
        </Card>
      </Section>

      <Section title="Popup Settings">
        <Card>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Reviews Per Page">
              <NumberInput value={config.drawerReviewsPerPage} min={1} max={50} onChange={(v) => update('drawerReviewsPerPage', v)} />
            </Field>
            <Field label="Width (px)">
              <NumberInput value={config.drawerWidth} min={280} max={1000} onChange={(v) => update('drawerWidth', v)} />
            </Field>
          </div>
          <div className="mt-4">
            <Field label="Mobile Mode">
              <Select
                value={config.drawerMobileMode}
                onChange={(v) => update('drawerMobileMode', v as WidgetConfig['drawerMobileMode'])}
                options={[
                  { value: 'peek', label: 'Peek Mode' },
                  { value: 'fullscreen', label: 'Full Screen' },
                ]}
              />
            </Field>
          </div>
        </Card>
      </Section>
    </>
  );
}
