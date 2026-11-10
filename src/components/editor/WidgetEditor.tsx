'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { WidgetConfig } from '@/lib/widget-config';
import { configToDbRow } from '@/lib/widget-config';
import type { BusinessInfo, Review } from '@/lib/reviews-data';
import { GoogleReviewsWidget } from '@/components/GoogleReviewsWidget';
import { EditorShell } from './EditorShell';
import {
  standardEditorTabMeta as tabMeta,
  standardEditorTabs as tabs,
  type StandardEditorTab as EditorTab,
} from './shared-tabs';
import { ContentTab, LayoutTab, SettingsTab, StyleTab } from './tabs';
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

export interface EditorWidget {
  widgetId: string;
  businessId: string;
  placeId: string;
  widgetName: string;
  initialConfig: WidgetConfig;
  business: BusinessInfo;
  reviews: Review[];
}

export function WidgetEditor({
  items,
  initialSelectedId,
  isNew = false,
}: {
  items: EditorWidget[];
  initialSelectedId?: string;
  isNew?: boolean;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string>(() =>
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
  const [activeTab, setActiveTab] = useState<EditorTab>('content');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [newBusiness, setNewBusiness] = useState<(BusinessInfo & { id: string; placeId: string }) | null>(null);
  const [selectedReviews, setSelectedReviews] = useState<Review[] | null>(null);
  const [reviewLoadStatus, setReviewLoadStatus] = useState<ReviewLoadStatus | null>(null);
  const [reviewFetching, setReviewFetching] = useState(false);
  const [photoMigrationStatus, setPhotoMigrationStatus] = useState<ReviewLoadStatus | null>(null);
  const [photoMigrating, setPhotoMigrating] = useState(false);

  const selected = items.find((i) => i.widgetId === selectedId);

  if (!selected) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)]">
        No Google Reviews Badge widgets found. Add a business in Supabase first.
      </div>
    );
  }

  const config = configs[selectedId] ?? selected.initialConfig;
  const widgetName = names[selectedId] ?? selected.widgetName;
  const currentBusiness = newBusiness ?? selected.business;
  const currentReviews = selectedReviews ?? selected.reviews;
  const currentPlaceId = newBusiness?.placeId ?? selected.placeId;
  const currentBusinessId = newBusiness?.id ?? selected.businessId;

  const update = <K extends keyof WidgetConfig>(key: K, value: WidgetConfig[K]) => {
    setConfigs((c) => ({ ...c, [selectedId]: { ...config, [key]: value } }));
    setSaved(false);
  };

  const save = async () => {
    if (reviewLoadStatus?.state === 'loading' || photoMigrationStatus?.state === 'loading') {
      alert('Wait for review processing to finish before saving.');
      return;
    }
    if (isNew && !(newBusiness?.id ?? selected.businessId)) {
      alert('Select a Google business before saving.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(isNew ? '/api/v1/widgets' : `/api/v1/widgets/${selectedId}`, {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(isNew ? { business_id: newBusiness?.id ?? selected.businessId, widget_type: 'google_reviews' } : {}),
          ...(!isNew && newBusiness ? { business_id: newBusiness.id } : {}),
          name: widgetName,
          ...configToDbRow(config),
        }),
      });
      const raw = await res.text();
      if (!res.ok) throw new Error(raw);
      const warning = liveCacheWarningFromText(raw);
      if (warning) showToast(warning, 'warning', 8000);
      if (isNew) {
        const row = JSON.parse(raw) as { id: string };
        router.replace(`/widgets/google-reviews?id=${row.id}`);
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
      setNames((current) => ({ ...current, [selectedId]: name }));
      setSaved(false);
    },
    businessName: currentBusiness.name,
    businessAddress: currentBusiness.address,
    reviews: currentReviews,
    reviewLoadStatus,
    hasReviews: currentReviews.length > 0,
    reviewFetching,
    photoMigrationStatus,
    photoMigrating,
    businesses: [],
    selectedBusinessId: newBusiness?.id ?? selected.businessId,
    onFetchReviews: async () => {
      if (!currentPlaceId || reviewFetching || photoMigrating) return;

      setReviewFetching(true);
      setPhotoMigrationStatus(null);
      setReviewLoadStatus({ state: 'loading', message: 'Fetching up to the latest 500 reviews…' });
      try {
        const result = await requestReviewSync(currentPlaceId);
        const syncWarning = liveCacheWarningOf(result);
        if (syncWarning) showToast(syncWarning, 'warning', 8000);

        const refreshedReviews = (result.reviews ?? []) as Review[];
        setSelectedReviews(refreshedReviews);
        setNewBusiness({
          id: newBusiness?.id ?? selected.businessId,
          placeId: currentPlaceId,
          name: result.businessName ?? currentBusiness.name,
          address: currentBusiness.address,
          averageRating: result.averageRating ?? currentBusiness.averageRating,
          totalReviews: result.totalReviews ?? currentBusiness.totalReviews,
        });
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
      if (!currentBusinessId || photoMigrating || reviewFetching) return;

      setPhotoMigrating(true);
      setPhotoMigrationStatus({
        state: 'loading',
        message: 'Storing and verifying existing review photos…',
      });
      try {
        const result = await requestReviewPhotoMigration(currentBusinessId);
        const migrationWarning = liveCacheWarningOf(result);
        if (migrationWarning) showToast(migrationWarning, 'warning', 8000);

        setSelectedReviews((result.reviews ?? []) as Review[]);
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
      if (option.source === 'google') {
        setNewBusiness({ id: option.id, placeId: option.placeId ?? '', name: option.name, address: option.address, averageRating: option.averageRating ?? 0, totalReviews: option.totalReviews ?? 0 });
        setSelectedReviews([]);
        setReviewLoadStatus({ state: 'loading', message: 'Selecting business…' });
        try {
          const business = await requestBusinessSelection(option);
          const businessWarning = liveCacheWarningOf(business);
          if (businessWarning) showToast(businessWarning, 'warning', 8000);
          const reviews = business.reviews ?? [];
          setNewBusiness({ id: business.id, placeId: business.placeId, name: business.name, address: business.address, averageRating: business.averageRating, totalReviews: business.totalReviews });
          setSelectedReviews(reviews);
          setReviewLoadStatus(reviews.length > 0
            ? { state: 'complete', message: `${reviews.length} reviews available` }
            : null);
        } catch (error) {
          setNewBusiness(null);
          setSelectedReviews(null);
          setReviewLoadStatus({ state: 'error', message: error instanceof Error ? error.message : 'Business selection failed' });
        }
      } else {
        const item = items.find((i) => i.businessId === option.id);
        if (item) { setSelectedId(item.widgetId); setNewBusiness(null); setSelectedReviews(null); setReviewLoadStatus(null); }
      }
      setSaved(false);
    },
  };

  return (
    <EditorShell
      title="Edit Google Reviews Badge"
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
        <div className="flex h-full items-center justify-center p-10">
          <GoogleReviewsWidget
            key={selectedId}
            widgetId={selectedId}
            config={config}
            business={currentBusiness}
            reviews={currentReviews}
            preview={config.position !== 'inline'}
          />
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
