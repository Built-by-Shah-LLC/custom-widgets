'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { WidgetConfig } from '@/lib/widget-config';
import { configToDbRow } from '@/lib/widget-config';
import type { BusinessInfo, Review } from '@/lib/reviews-data';
import { ScaledCarouselPreview } from '@/components/ScaledCarouselPreview';
import { EditorShell } from './EditorShell';
import {
  standardEditorTabMeta as tabMeta,
  standardEditorTabs as tabs,
  type StandardEditorTab as EditorTab,
} from './shared-tabs';
import { ContentTab, LayoutTab, SettingsTab, StyleTab } from './carousel-tabs';
import type { BusinessOption } from './tabs';
import { reviewSyncStatus, type ReviewLoadStatus } from './review-sync-status';
import { reviewPhotoMigrationStatus } from './review-photo-migration-status';
import {
  requestBusinessSelection,
  requestReviewPhotoMigration,
  requestReviewSync,
} from './review-api';
import { liveCacheWarningFromText, liveCacheWarningOf } from '@/lib/live-cache-warning';
import { showToast } from '@/components/ui/Toast';

export interface CarouselEditorWidget {
  widgetId: string;
  widgetName: string;
  businessId: string;
  placeId: string;
  initialConfig: WidgetConfig;
  business: BusinessInfo;
  reviews: Review[];
}

export interface CarouselBusiness extends BusinessInfo {
  id: string;
  placeId: string;
}

export function CarouselEditor({
  items,
  initialSelectedId,
  allBusinesses = [],
  reviewsByBusiness = {},
  isNew = false,
}: {
  items: CarouselEditorWidget[];
  initialSelectedId?: string;
  allBusinesses?: CarouselBusiness[];
  reviewsByBusiness?: Record<string, Review[]>;
  isNew?: boolean;
}) {
  const router = useRouter();
  const [selectedId] = useState<string>(() =>
    initialSelectedId && items.some((i) => i.widgetId === initialSelectedId)
      ? initialSelectedId
      : (items[0]?.widgetId ?? '')
  );
  const [configs, setConfigs] = useState<Record<string, WidgetConfig>>(() =>
    Object.fromEntries(items.map((i) => [i.widgetId, i.initialConfig]))
  );
  const [names, setNames] = useState<Record<string, string>>(() =>
    Object.fromEntries(items.map((i) => [i.widgetId, i.widgetName]))
  );
  const [businessIds, setBusinessIds] = useState<Record<string, string>>(() =>
    Object.fromEntries(items.map((i) => [i.widgetId, i.businessId]))
  );
  const [activeTab, setActiveTab] = useState<EditorTab>('content');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [addedBusinesses, setAddedBusinesses] = useState<CarouselBusiness[]>([]);
  const [loadedReviews, setLoadedReviews] = useState<Record<string, Review[]>>({});
  const [reviewLoadStatus, setReviewLoadStatus] = useState<ReviewLoadStatus | null>(null);
  const [reviewFetching, setReviewFetching] = useState(false);
  const [photoMigrationStatus, setPhotoMigrationStatus] = useState<ReviewLoadStatus | null>(null);
  const [photoMigrating, setPhotoMigrating] = useState(false);

  const selected = items.find((i) => i.widgetId === selectedId);

  if (!selected) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)]">
        No Google Reviews Carousel widgets found. Duplicate the seeded carousel or add one in
        Supabase first.
      </div>
    );
  }

  const config = configs[selectedId] ?? selected.initialConfig;
  const widgetName = names[selectedId] ?? selected.widgetName;
  const businessId = businessIds[selectedId] ?? selected.businessId;
  const availableBusinesses = [...addedBusinesses, ...allBusinesses];
  const business = availableBusinesses.find((b) => b.id === businessId) ?? selected.business;
  const reviews = loadedReviews[businessId] ?? reviewsByBusiness[businessId] ?? selected.reviews;
  const placeId = availableBusinesses.find((b) => b.id === businessId)?.placeId
    ?? (businessId === selected.businessId ? selected.placeId : '');

  const update = <K extends keyof WidgetConfig>(key: K, value: WidgetConfig[K]) => {
    setConfigs((c) => ({ ...c, [selectedId]: { ...config, [key]: value } }));
    setSaved(false);
  };

  const save = async () => {
    if (reviewLoadStatus?.state === 'loading' || photoMigrationStatus?.state === 'loading') {
      alert('Wait for review processing to finish before saving.');
      return;
    }
    if (!businessId) {
      alert('Select a Google business before saving.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(isNew ? '/api/v1/widgets' : `/api/v1/widgets/${selectedId}`, {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: widgetName,
          business_id: businessId,
          ...(isNew ? { widget_type: 'google_reviews_carousel' } : {}),
          ...configToDbRow(config),
        }),
      });
      const raw = await res.text();
      if (!res.ok) throw new Error(raw);
      const warning = liveCacheWarningFromText(raw);
      if (warning) showToast(warning, 'warning', 8000);
      if (isNew) {
        const row = JSON.parse(raw) as { id: string };
        router.replace(`/widgets/google-reviews-carousel?id=${row.id}`);
        return;
      }
      setSaved(true);
    } catch (err) {
      alert(`Save failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  const tabProps = {
    config,
    update,
    widgetName,
    onNameChange: (name: string) => {
      setNames((n) => ({ ...n, [selectedId]: name }));
      setSaved(false);
    },
    business,
    reviews,
    reviewLoadStatus,
    hasReviews: reviews.length > 0,
    reviewFetching,
    photoMigrationStatus,
    photoMigrating,
    businesses: [],
    selectedBusinessId: businessId,
    onFetchReviews: async () => {
      if (!placeId || reviewFetching || photoMigrating) return;

      setReviewFetching(true);
      setPhotoMigrationStatus(null);
      setReviewLoadStatus({ state: 'loading', message: 'Fetching up to the latest 500 reviews…' });
      try {
        const result = await requestReviewSync(placeId);
        const syncWarning = liveCacheWarningOf(result);
        if (syncWarning) showToast(syncWarning, 'warning', 8000);

        const refreshedReviews = (result.reviews ?? []) as Review[];
        setLoadedReviews((current) => ({ ...current, [businessId]: refreshedReviews }));
        setAddedBusinesses((current) => [{
          id: businessId,
          placeId,
          name: result.businessName ?? business.name,
          address: business.address,
          averageRating: result.averageRating ?? business.averageRating,
          totalReviews: result.totalReviews ?? business.totalReviews,
        }, ...current.filter((item) => item.id !== businessId)]);
        setReviewLoadStatus(reviewSyncStatus({
          ...result,
          reviewsStored: refreshedReviews.length,
        }));
      } catch (error) {
        setReviewLoadStatus({
          state: 'error',
          message: error instanceof Error ? error.message : 'Review fetch failed',
        });
      } finally {
        setReviewFetching(false);
      }
    },
    onMigrateReviewPhotos: async () => {
      if (!businessId || photoMigrating || reviewFetching) return;

      setPhotoMigrating(true);
      setPhotoMigrationStatus({
        state: 'loading',
        message: 'Storing and verifying existing review photos…',
      });
      try {
        const result = await requestReviewPhotoMigration(businessId);
        const migrationWarning = liveCacheWarningOf(result);
        if (migrationWarning) showToast(migrationWarning, 'warning', 8000);

        setLoadedReviews((current) => ({
          ...current,
          [businessId]: (result.reviews ?? []) as Review[],
        }));
        setPhotoMigrationStatus(reviewPhotoMigrationStatus(result));
      } catch (error) {
        setPhotoMigrationStatus({
          state: 'error',
          message: error instanceof Error ? error.message : 'Review photo migration failed',
        });
      } finally {
        setPhotoMigrating(false);
      }
    },
    onSelectBusiness: async (option: BusinessOption) => {
      setPhotoMigrationStatus(null);
      let id = option.id;
      if (option.source === 'google') {
        setAddedBusinesses((current) => [{ id, placeId: option.placeId ?? '', name: option.name, address: option.address, averageRating: option.averageRating ?? 0, totalReviews: option.totalReviews ?? 0 }, ...current.filter((b) => b.id !== id)]);
        setBusinessIds((current) => ({ ...current, [selectedId]: id }));
        setReviewLoadStatus({ state: 'loading', message: 'Selecting business…' });
        try {
          const savedBusiness = await requestBusinessSelection(option);
          const businessWarning = liveCacheWarningOf(savedBusiness);
          if (businessWarning) showToast(businessWarning, 'warning', 8000);
          id = savedBusiness.id;
          const reviews = savedBusiness.reviews ?? [];
          setAddedBusinesses((current) => [{ id, placeId: savedBusiness.placeId, name: savedBusiness.name, address: savedBusiness.address, averageRating: savedBusiness.averageRating, totalReviews: savedBusiness.totalReviews }, ...current.filter((b) => b.id !== id && b.id !== option.id)]);
          setLoadedReviews((current) => ({ ...current, [id]: reviews }));
          setReviewLoadStatus(reviews.length > 0
            ? { state: 'complete', message: `${reviews.length} reviews available` }
            : null);
        } catch (error) {
          setAddedBusinesses((current) => current.filter((b) => b.id !== option.id));
          setBusinessIds((current) => ({ ...current, [selectedId]: selected.businessId }));
          setReviewLoadStatus({ state: 'error', message: error instanceof Error ? error.message : 'Business selection failed' });
          return;
        }
      }
      setBusinessIds((m) => ({ ...m, [selectedId]: id }));
      setSaved(false);
    },
  };

  return (
    <EditorShell
      title="Edit Google Reviews Carousel"
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={(id) => setActiveTab(id as EditorTab)}
      tabMeta={tabMeta}
      saveLabel="Save Changes"
      saving={saving}
      saved={saved}
      onSave={save}
      previewLabel={widgetName}
      preview={
        <div className="flex h-full items-start justify-center overflow-x-hidden overflow-y-auto p-10">
          <div className="w-full">
            <ScaledCarouselPreview
              key={selectedId}
              widgetId={selectedId}
              config={config}
              business={business}
              reviews={reviews}
            />
          </div>
        </div>
      }
    >
      {activeTab === 'content' && <ContentTab {...tabProps} />}
      {activeTab === 'style' && <StyleTab {...tabProps} />}
      {activeTab === 'layout' && <LayoutTab {...tabProps} />}
      {activeTab === 'settings' && <SettingsTab {...tabProps} />}
    </EditorShell>
  );
}
