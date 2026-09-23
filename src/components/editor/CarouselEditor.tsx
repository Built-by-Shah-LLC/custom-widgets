'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { WidgetConfig } from '@/lib/widget-config';
import { configToDbRow } from '@/lib/widget-config';
import type { BusinessInfo, Review } from '@/lib/reviews-data';
import { ScaledCarouselPreview } from '@/components/ScaledCarouselPreview';
import { EditorShell, type EditorTabDef, type EditorTabMeta } from './EditorShell';
import { ContentTab, LayoutTab, SettingsTab, StyleTab } from './carousel-tabs';
import type { BusinessOption } from './tabs';
import { reviewSyncStatus, type ReviewLoadStatus } from './review-sync-status';
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

type EditorTab = 'content' | 'style' | 'layout' | 'settings';

const tabs: EditorTabDef[] = [
  {
    id: 'content',
    label: 'Content',
    icon: <span className="font-serif text-xl font-bold">T</span>,
  },
  {
    id: 'style',
    label: 'Style',
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
        <path d="M12 22a10 10 0 110-20c5.5 0 10 4.5 10 9 0 2.5-2 4.5-4.5 4.5h-2.5a2.5 2.5 0 00-2 4c.6.8.4 2.5-1 2.5zm-5-10a1 1 0 100-2 1 1 0 000 2zm4-4a1 1 0 100-2 1 1 0 000 2zm6 0a1 1 0 100-2 1 1 0 000 2zm-4 4a1 1 0 100-2 1 1 0 000 2z" />
      </svg>
    ),
  },
  {
    id: 'layout',
    label: 'Layout',
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M3 9h18M9 21V9" />
      </svg>
    ),
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33h.01a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51h.01a1.65 1.65 0 001.82-.33l.06.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00.33 1.82v.01a1.65 1.65 0 00-1.51-1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1H3a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" />
      </svg>
    ),
  },
];

const tabMeta: Record<EditorTab, EditorTabMeta> = {
  content: { title: 'Content', subtitle: 'Configure your content and basic settings' },
  style: { title: 'Style', subtitle: 'Customize colors, themes, and visual appearance' },
  layout: { title: 'Layout', subtitle: 'Adjust spacing, sizing, and layout options' },
  settings: { title: 'Settings', subtitle: 'Advanced configuration and integration options' },
};

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
    if (reviewLoadStatus?.state === 'loading') {
      alert('Wait for reviews to finish loading before saving.');
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
    businesses: [],
    selectedBusinessId: businessId,
    onFetchReviews: async () => {
      if (!placeId || reviewFetching) return;

      setReviewFetching(true);
      setReviewLoadStatus({ state: 'loading', message: 'Fetching up to the latest 500 reviews…' });
      try {
        const response = await fetch('/api/v1/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ placeId }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(result.message ?? result.error ?? 'Review fetch failed');
        }
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
    onSelectBusiness: async (option: BusinessOption) => {
      let id = option.id;
      if (option.source === 'google') {
        setAddedBusinesses((current) => [{ id, placeId: option.placeId ?? '', name: option.name, address: option.address, averageRating: option.averageRating ?? 0, totalReviews: option.totalReviews ?? 0 }, ...current.filter((b) => b.id !== id)]);
        setBusinessIds((current) => ({ ...current, [selectedId]: id }));
        setReviewLoadStatus({ state: 'loading', message: 'Selecting business…' });
        try {
          const response = await fetch('/api/v1/businesses', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(option),
          });
          const savedBusiness = await response.json();
          if (!response.ok) throw new Error(savedBusiness.message ?? savedBusiness.error ?? 'Could not select business');
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
