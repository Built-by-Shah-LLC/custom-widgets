'use client';

import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { BeforeAfterConfig } from '@/lib/before-after-config';
import { beforeAfterToDbRow, defaultBeforeAfterConfig } from '@/lib/before-after-config';
import type { FormConfig } from '@/lib/form-config';
import { formToDbRow, defaultFormConfig } from '@/lib/form-config';
import type { WidgetConfig } from '@/lib/widget-config';
import { configToDbRow } from '@/lib/widget-config';
import type { BusinessInfo, Review } from '@/lib/reviews-data';
import { Button, Input, Modal } from '@/components/ui';
import { showConfirm } from '@/components/ui/ConfirmDialog';
import { showToast } from '@/components/ui/Toast';
import { BeforeAfterWidget } from './BeforeAfterWidget';
import { FormWidget } from './FormWidget';
import { GoogleReviewsWidget } from './GoogleReviewsWidget';
import { GoogleReviewsCarousel } from './GoogleReviewsCarousel';

export interface BeforeAfterItem {
  id: string;
  name: string;
  config: BeforeAfterConfig;
}

export interface FormItem {
  id: string;
  name: string;
  config: FormConfig;
}

export interface GoogleReviewsItem {
  id: string;
  businessId: string;
  widgetType: 'google_reviews' | 'google_reviews_carousel';
  name: string;
  config: WidgetConfig;
  business?: BusinessInfo;
  reviews?: Review[];
}

type WidgetTypeKey = 'before-after' | 'form' | 'google-reviews' | 'google-reviews-carousel';

const ITEMS_PER_PAGE = 9;

function LoadMoreSentinel({ onLoadMore }: { onLoadMore: () => void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) onLoadMore();
      },
      { root: null, rootMargin: '200px', threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [onLoadMore]);
  return <div ref={ref} className="col-span-full h-4" aria-hidden="true" />;
}

const widgetTypeMeta: Record<
  WidgetTypeKey,
  { name: string; modalTitle: string; typeLabel: string; description: string }
> = {
  'before-after': {
    name: 'Before/After Slider',
    modalTitle: 'Before/After Sliders',
    typeLabel: 'Before/After Slider',
    description:
      'Showcase stunning before and after transformations with interactive drag sliders',
  },
  form: {
    name: 'Multi-Step Form',
    modalTitle: 'Multi-Step Forms',
    typeLabel: 'Multi-Step Form',
    description:
      'Capture leads and quote requests with fully customizable multi-step forms',
  },
  'google-reviews': {
    name: 'Google Reviews Badge',
    modalTitle: 'Google Reviews Badges',
    typeLabel: 'Google Reviews Badge',
    description: 'Build customer trust by displaying your latest Google reviews in real-time',
  },
  'google-reviews-carousel': {
    name: 'Google Reviews Carousel',
    modalTitle: 'Google Reviews Carousels',
    typeLabel: 'Google Reviews Carousel',
    description: 'Paginated carousel of your latest Google review cards',
  },
};

function buildEmbedCode(id: string) {
  return [
    '<!-- BuiltByShah Widget Embed -->',
    `<div data-bbs-embed="${id}"></div>`,
    // Both scripts are async classic scripts. The runtime coordinates either
    // execution order and mounts each placeholder as soon as its own data and
    // renderer are ready; the stable URLs survive future deployments.
    `<script async src="${window.location.origin}/api/embeds/widget/${id}/data.js"></script>`,
    `<script async src="${window.location.origin}/api/embeds/widget.js"></script>`,
    '<!-- End BuiltByShah Widget Embed -->',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Small icons
// ---------------------------------------------------------------------------

function DuplicateIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Embed code popup (Copy Code / How to Use)
// ---------------------------------------------------------------------------

function EmbedCodeModal({
  id,
  name,
  typeLabel,
  onClose,
}: {
  id: string;
  name: string;
  typeLabel: string;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'code' | 'howto'>('code');
  const [copied, setCopied] = useState(false);
  const code = buildEmbedCode(id);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      showToast('Copy failed — clipboard is not available.', 'error');
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={name}
      description={typeLabel}
      size="lg"
      showClose
    >
      {/* Tabs */}
      <div className="mb-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setTab('code')}
          className={`flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition-colors ${
            tab === 'code'
              ? 'bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] ring-1 ring-[var(--color-border)]'
              : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]'
          }`}
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M16 18l6-6-6-6M8 6l-6 6 6 6" />
          </svg>
          Copy Code
        </button>
        <button
          type="button"
          onClick={() => setTab('howto')}
          className={`flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition-colors ${
            tab === 'howto'
              ? 'bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] ring-1 ring-[var(--color-border)]'
              : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]'
          }`}
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" />
            <path d="M9.1 9a3 3 0 015.8 1c0 2-3 3-3 3M12 17h.01" />
          </svg>
          How to Use
        </button>
      </div>

      {tab === 'code' ? (
        <>
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Your Embed Code</h3>
          <p className="mt-0.5 mb-3 text-xs text-[var(--color-text-secondary)]">
            Copy this code to add the embed to your website
          </p>
          <div className="flex items-start gap-3 rounded-xl bg-[var(--color-bg-secondary)] p-4 ring-1 ring-[var(--color-border)]">
            <pre className="min-w-0 flex-1 font-mono text-xs leading-relaxed break-all whitespace-pre-wrap text-[var(--color-text-secondary)]">
              {code}
            </pre>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={copy}
              iconLeft={
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <rect x="9" y="9" width="12" height="12" rx="2" />
                  <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                </svg>
              }
            >
              {copied ? 'Copied ✓' : 'Copy'}
            </Button>
          </div>
        </>
      ) : (
        <>
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">How to Add This Embed</h3>
          <p className="mt-0.5 mb-4 text-xs text-[var(--color-text-secondary)]">
            Follow these steps to add the embed to your website
          </p>

          {[
            {
              title: 'Find your code block or custom HTML section',
              body: 'Go to the page on your website where you want the embed to appear. Look for a code block, custom HTML, or embed component in your website builder or CMS.',
            },
            {
              title: 'Paste the embed code',
              body: 'Copy the code from the "Copy Code" tab and paste it into the code block or custom HTML section where you want the embed to display.',
            },
            {
              title: 'Save and publish',
              body: 'Save your changes and publish the page. The embed should appear immediately. If not, try clearing your browser cache or checking the troubleshooting tips below.',
            },
          ].map((step, i) => (
            <div key={i} className="mb-4 flex gap-3">
              <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[var(--color-bg-secondary)] text-xs font-bold text-[var(--color-text-primary)] ring-1 ring-[var(--color-border)]">
                {i + 1}
              </span>
              <div>
                <div className="text-sm font-semibold text-[var(--color-text-primary)]">{step.title}</div>
                <p className="mt-1 text-xs leading-relaxed text-[var(--color-text-secondary)]">{step.body}</p>
              </div>
            </div>
          ))}

          <div className="mt-5 rounded-xl bg-[var(--color-bg-secondary)] p-4 ring-1 ring-[var(--color-border)]">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[var(--color-text-primary)]">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M16 18l6-6-6-6M8 6l-6 6 6 6" />
              </svg>
              Common Platforms
            </div>
            <ul className="space-y-1.5 text-xs text-[var(--color-text-secondary)]">
              <li><span className="font-semibold text-[var(--color-text-primary)]">WordPress:</span> Add a “Custom HTML” block</li>
              <li><span className="font-semibold text-[var(--color-text-primary)]">Squarespace:</span> Add a “Code” block</li>
              <li><span className="font-semibold text-[var(--color-text-primary)]">Wix:</span> Add an “Embed Code” element</li>
              <li><span className="font-semibold text-[var(--color-text-primary)]">Webflow:</span> Add an “Embed” element</li>
              <li><span className="font-semibold text-[var(--color-text-primary)]">Shopify:</span> Edit theme and add to a custom liquid section</li>
            </ul>
          </div>
        </>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Widget card (inside a type modal)
// ---------------------------------------------------------------------------

const CAROUSEL_THUMB_WIDTH = 1200;

/**
 * Renders the full carousel at a fixed desktop width and scales it down to
 * fit the small card preview box (both dimensions), so the thumbnail shows
 * the whole widget instead of a clipped full-size render.
 */
function CarouselThumbnail({ item }: { item: GoogleReviewsItem }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [geom, setGeom] = useState({ scale: 0, left: 0, top: 0 });

  useEffect(() => {
    const box = boxRef.current;
    const content = contentRef.current;
    if (!box || !content) return;
    const measure = () => {
      const bw = box.clientWidth;
      const bh = box.clientHeight;
      const ch = content.offsetHeight || 1;
      if (!bw || !bh) return;
      const scale = Math.min(bw / CAROUSEL_THUMB_WIDTH, bh / ch);
      setGeom({
        scale,
        left: (bw - CAROUSEL_THUMB_WIDTH * scale) / 2,
        top: Math.max(0, (bh - ch * scale) / 2),
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    ro.observe(content);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="h-full w-full bg-white p-2">
      <div ref={boxRef} className="relative h-full w-full overflow-hidden">
        <div
          ref={contentRef}
          style={{
            position: 'absolute',
            top: geom.top,
            left: geom.left,
            width: CAROUSEL_THUMB_WIDTH,
            transform: `scale(${geom.scale})`,
            transformOrigin: 'top left',
            visibility: geom.scale ? 'visible' : 'hidden',
          }}
        >
          <GoogleReviewsCarousel
            config={item.config}
            business={item.business}
            reviews={item.reviews}
            disableResponsive
          />
        </div>
      </div>
    </div>
  );
}

function WidgetCard({
  name,
  editHref,
  onCopyCode,
  onDuplicate,
  onDelete,
  children,
}: {
  name: string;
  editHref: string;
  onCopyCode: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  children: ReactNode;
}) {
  const router = useRouter();

  useEffect(() => {
    router.prefetch(editHref);
  }, [editHref, router]);

  return (
    <div className="group rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-3 shadow-[var(--shadow-sm)] transition-shadow hover:shadow-[var(--shadow-md)]">
      {/* Preview with hover actions */}
      <div className="relative">
        <div className="pointer-events-none h-44 overflow-hidden rounded-lg bg-[var(--color-bg-secondary)]">
          {children}
        </div>
        <div className="absolute top-3 right-2 z-10 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            onClick={onDuplicate}
            title="Duplicate"
            className="ui-control flex h-7 w-7 items-center justify-center rounded-md bg-white/80 p-0 text-[var(--color-text-secondary)] shadow-sm ring-1 ring-[var(--color-border)] transition-colors hover:bg-white hover:text-[var(--color-text-primary)]"
          >
            <DuplicateIcon />
          </button>
          <button
            type="button"
            onClick={onDelete}
            title="Delete"
            className="ui-control flex h-7 w-7 items-center justify-center rounded-md bg-white/80 p-0 text-[var(--color-text-secondary)] shadow-sm ring-1 ring-[var(--color-border)] transition-colors hover:bg-[var(--color-danger)] hover:text-white"
          >
            <TrashIcon />
          </button>
        </div>
      </div>

      {/* Name */}
      <div className="mt-3 truncate text-sm font-semibold text-[var(--color-text-primary)]" title={name}>
        {name}
      </div>

      {/* Actions */}
      <div className="mt-2 flex gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          fullWidth
          onClick={onCopyCode}
          iconLeft={
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M16 18l6-6-6-6M8 6l-6 6 6 6" />
            </svg>
          }
        >
          Copy Code
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          fullWidth
          onClick={() => router.push(editHref)}
          iconLeft={
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M17 3a2.83 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
            </svg>
          }
        >
          Edit
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Home-page type card preview mocks (stylized skeletons)
// ---------------------------------------------------------------------------

function MockBar({ className }: { className: string }) {
  return <div className={`rounded-full bg-[var(--color-border)] ${className}`} />;
}

function BeforeAfterMock() {
  return (
    <div className="relative h-full w-full overflow-hidden">
      <div className="absolute inset-y-0 left-0 w-1/2 bg-[var(--color-bg-hover)]" />
      <div className="absolute inset-y-0 right-0 w-1/2 bg-[var(--color-border-light)]" />
      <div className="absolute inset-y-0 left-1/2 w-0.5 bg-[var(--color-text-muted)]" />
      <div className="absolute top-1/2 left-1/2 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-[var(--color-border)]">
        <svg className="h-4 w-4 text-[var(--color-text-secondary)]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path d="M8 7l-5 5 5 5M16 7l5 5-5 5" />
        </svg>
      </div>
      <div className="absolute top-3 left-3 h-4 w-12 rounded-full bg-[var(--color-bg-hover)]" />
      <div className="absolute top-3 right-3 h-4 w-12 rounded-full bg-[var(--color-bg-hover)]" />
    </div>
  );
}

function MiniReviewCard() {
  return (
    <div className="w-16 flex-shrink-0 rounded-md bg-white p-1.5 shadow-sm ring-1 ring-[var(--color-border)]">
      <div className="mb-1 flex items-center gap-1">
        <div className="h-2.5 w-2.5 rounded-full bg-[var(--color-bg-hover)]" />
        <MockBar className="h-1 w-7" />
      </div>
      <div className="mb-1 flex gap-px">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-1 w-1 rounded-full bg-amber-400/70" />
        ))}
      </div>
      <MockBar className="mb-0.5 h-1 w-full" />
      <MockBar className="mb-0.5 h-1 w-full" />
      <MockBar className="h-1 w-2/3" />
      <div className="mt-1 text-[6px] font-bold text-[var(--color-text-muted)]">G</div>
    </div>
  );
}

function GoogleReviewsMock() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-4">
      <div className="flex items-center gap-1.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <svg key={i} className="h-3 w-3 text-amber-400/80" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        ))}
        <span className="text-xs font-semibold text-[var(--color-text-secondary)]">4.9</span>
      </div>
      <div className="flex gap-2">
        <MiniReviewCard />
        <MiniReviewCard />
        <MiniReviewCard />
        <MiniReviewCard />
      </div>
    </div>
  );
}

function CarouselMock() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-4">
      <div className="flex gap-2">
        <MiniReviewCard />
        <MiniReviewCard />
        <MiniReviewCard />
      </div>
      <div className="flex items-center gap-2">
        <div className="flex h-4 w-4 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-[var(--color-border)]">
          <svg className="h-2 w-2 text-[var(--color-text-secondary)]" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </div>
        <div className="flex gap-1">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`h-1.5 w-1.5 rounded-full ${i === 0 ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-border)]'}`}
            />
          ))}
        </div>
        <div className="flex h-4 w-4 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-[var(--color-border)]">
          <svg className="h-2 w-2 text-[var(--color-text-secondary)]" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </div>
      </div>
    </div>
  );
}

function FormMock() {
  return (
    <div className="flex h-full w-full flex-col gap-2 p-4">
      <MockBar className="h-3 w-1/3" />
      <MockBar className="h-2 w-2/3" />
      <div className="mt-2 space-y-1.5">
        <MockBar className="h-1.5 w-1/4" />
        <MockBar className="h-3.5 w-full" />
      </div>
      <div className="space-y-1.5">
        <MockBar className="h-1.5 w-1/4" />
        <MockBar className="h-3.5 w-full" />
      </div>
      <div className="mt-auto flex gap-2">
        <MockBar className="h-4 w-1/2" />
        <MockBar className="h-4 w-1/2" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Home + modal
// ---------------------------------------------------------------------------

interface EmbedTarget {
  id: string;
  name: string;
  typeLabel: string;
}

interface DeleteTarget {
  type: WidgetTypeKey;
  id: string;
  name: string;
}

export function WidgetsHome() {
  const router = useRouter();
  const [openType, setOpenType] = useState<WidgetTypeKey | null>(null);
  const [embedTarget, setEmbedTarget] = useState<EmbedTarget | null>(null);
  const [search, setSearch] = useState('');
  const [beforeAfterItems, setBeforeAfterItems] = useState<BeforeAfterItem[]>([]);
  const [formItems, setFormItems] = useState<FormItem[]>([]);
  const [googleReviewsItems, setGoogleReviewsItems] = useState<GoogleReviewsItem[]>([]);
  const [carouselItems, setCarouselItems] = useState<GoogleReviewsItem[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [listPage, setListPage] = useState(0);
  const [listHasMore, setListHasMore] = useState(false);
  const [listError, setListError] = useState('');
  const [busy, setBusy] = useState(false);

  // Re-entrancy guard: the kit ConfirmDialog closes imperatively, so its
  // Confirm button can be clicked twice before React re-renders — `busy`
  // state closures would be stale. A ref reliably stops a second fetch
  // (double-delete → 404 toast, double-duplicate → two copies).
  const actionInFlightRef = useRef(false);
  const listRequestRef = useRef(0);

  const query = search.trim().toLowerCase();

  const close = () => {
    setOpenType(null);
    setSearch('');
    setEmbedTarget(null);
  };

  const setItemsForType = useCallback((type: WidgetTypeKey, items: BeforeAfterItem[] | GoogleReviewsItem[] | FormItem[], append: boolean) => {
    if (type === 'before-after') {
      setBeforeAfterItems((current) => append ? [...current, ...(items as BeforeAfterItem[])] : items as BeforeAfterItem[]);
    } else if (type === 'form') {
      setFormItems((current) => append ? [...current, ...(items as FormItem[])] : items as FormItem[]);
    } else if (type === 'google-reviews') {
      setGoogleReviewsItems((current) => append ? [...current, ...(items as GoogleReviewsItem[])] : items as GoogleReviewsItem[]);
    } else {
      setCarouselItems((current) => append ? [...current, ...(items as GoogleReviewsItem[])] : items as GoogleReviewsItem[]);
    }
  }, []);

  const fetchWidgetPage = useCallback(async (type: WidgetTypeKey, page: number, searchValue: string, append = false) => {
    const requestId = ++listRequestRef.current;
    if (append) setLoadingMore(true); else setListLoading(true);
    setListError('');
    try {
      const params = new URLSearchParams({ type, page: String(page), pageSize: String(ITEMS_PER_PAGE) });
      if (searchValue.trim()) params.set('search', searchValue.trim());
      const response = await fetch(`/api/v1/widget-lists?${params}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Could not load widgets');
      if (requestId !== listRequestRef.current) return;
      setItemsForType(type, payload.items, append);
      setListPage(page);
      setListHasMore(Boolean(payload.hasMore));
    } catch (error) {
      if (requestId === listRequestRef.current) setListError(error instanceof Error ? error.message : 'Could not load widgets');
    } finally {
      if (requestId === listRequestRef.current) { setListLoading(false); setLoadingMore(false); }
    }
  }, [setItemsForType]);

  const openModal = (type: WidgetTypeKey) => {
    setOpenType(type);
    setSearch('');
    setListError('');
    setItemsForType(type, [], false);
    setListLoading(true);
  };

  const handleSearchChange = (value: string) => {
    setSearch(value);
  };

  const loadMore = useCallback(() => {
    if (!openType || listLoading || loadingMore || !listHasMore) return;
    void fetchWidgetPage(openType, listPage + 1, search, true);
  }, [fetchWidgetPage, listHasMore, listLoading, listPage, loadingMore, openType, search]);

  useEffect(() => {
    if (!openType) return;
    const delay = search.trim() ? 400 : 0;
    const timer = window.setTimeout(() => {
      setItemsForType(openType, [], false);
      void fetchWidgetPage(openType, 0, search);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [fetchWidgetPage, openType, search, setItemsForType]);

  // --- Before/After mutations ------------------------------------------------

  const duplicateBeforeAfter = async (item: BeforeAfterItem) => {
    if (actionInFlightRef.current) return;
    actionInFlightRef.current = true;
    setBusy(true);
    try {
      const res = await fetch('/api/v1/before-after-widgets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${item.name} (Copy)`,
          ...beforeAfterToDbRow(item.config),
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const row = await res.json();
      // Add the copy as the first item (top-left of the grid).
      setBeforeAfterItems((list) => [
        { id: row.id, name: row.name, config: item.config },
        ...list,
      ]);
      // Refresh server props so a remount (close/reopen the modal) doesn't
      // re-initialize the list from the stale pre-duplicate payload.
      router.refresh();
      showToast(`“${item.name}” duplicated`, 'success');
    } catch (err) {
      showToast(`Duplicate failed: ${err instanceof Error ? err.message : 'unknown error'}`, 'error');
    } finally {
      actionInFlightRef.current = false;
      setBusy(false);
    }
  };

  // Performs the delete once the user confirms in the popup.
  const confirmDelete = async (deleteTarget: DeleteTarget) => {
    if (actionInFlightRef.current) return;
    actionInFlightRef.current = true;
    setBusy(true);
    try {
      const url =
        deleteTarget.type === 'before-after' || deleteTarget.type === 'form'
          ? `/api/v1/${deleteTarget.type === 'form' ? 'form-widgets' : 'before-after-widgets'}/${deleteTarget.id}`
          : `/api/v1/widgets/${deleteTarget.id}`;
      const res = await fetch(url, { method: 'DELETE' });
      if (!res.ok) throw new Error(await res.text());
      if (deleteTarget.type === 'before-after') {
        setBeforeAfterItems((list) => list.filter((x) => x.id !== deleteTarget.id));
      } else if (deleteTarget.type === 'form') {
        setFormItems((list) => list.filter((x) => x.id !== deleteTarget.id));
      } else if (deleteTarget.type === 'google-reviews-carousel') {
        setCarouselItems((list) => list.filter((x) => x.id !== deleteTarget.id));
      } else {
        setGoogleReviewsItems((list) => list.filter((x) => x.id !== deleteTarget.id));
      }
      router.refresh();
      showToast(`“${deleteTarget.name}” deleted`, 'success');
    } catch (err) {
      showToast(`Delete failed: ${err instanceof Error ? err.message : 'unknown error'}`, 'error');
    } finally {
      actionInFlightRef.current = false;
      setBusy(false);
    }
  };

  const requestDelete = (deleteTarget: DeleteTarget) => {
    showConfirm(
      'Delete this embed?',
      `“${deleteTarget.name}” will be permanently deleted. This cannot be undone.`,
      () => confirmDelete(deleteTarget),
      { confirmText: 'Delete', cancelText: 'Cancel' }
    );
  };

  const createBeforeAfter = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/v1/before-after-widgets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Before/After Slider',
          ...beforeAfterToDbRow(defaultBeforeAfterConfig),
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const row = await res.json();
      close();
      router.push(`/widgets/before-after?id=${row.id}`);
    } catch (err) {
      showToast(`Create failed: ${err instanceof Error ? err.message : 'unknown error'}`, 'error');
      setBusy(false);
    }
  };

  const duplicateForm = async (item: FormItem) => {
    if (actionInFlightRef.current) return;
    actionInFlightRef.current = true;
    setBusy(true);
    try {
      const res = await fetch('/api/v1/form-widgets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${item.name} (Copy)`,
          ...formToDbRow(item.config),
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const row = await res.json();
      setFormItems((list) => [
        { id: row.id, name: row.name, config: item.config },
        ...list,
      ]);
      router.refresh();
      showToast(`“${item.name}” duplicated`, 'success');
    } catch (err) {
      showToast(`Duplicate failed: ${err instanceof Error ? err.message : 'unknown error'}`, 'error');
    } finally {
      actionInFlightRef.current = false;
      setBusy(false);
    }
  };

  const createForm = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/v1/form-widgets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Multi-Step Form',
          ...formToDbRow(defaultFormConfig),
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const row = await res.json();
      close();
      router.push(`/widgets/form?id=${row.id}`);
    } catch (err) {
      showToast(`Create failed: ${err instanceof Error ? err.message : 'unknown error'}`, 'error');
      setBusy(false);
    }
  };

  // --- Google Reviews (badge + carousel) mutations -----------------------------

  const createGoogleReviews = (type: 'google-reviews' | 'google-reviews-carousel') => {
    close();
    router.push(`/widgets/${type}?new=1`);
    // A widget needs a business — reuse the one from any existing widget.
    /*
    const source = googleReviewsItems[0] ?? carouselItems[0];
    if (!source) {
      showToast('No business found. Add a business in Supabase first.', 'error');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/v1/widgets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_id: source.businessId,
          widget_type:
            type === 'google-reviews-carousel' ? 'google_reviews_carousel' : 'google_reviews',
          name: widgetTypeMeta[type].typeLabel,
          ...configToDbRow(defaultWidgetConfig),
          cached_reviews: source.reviews ?? [],
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const row = await res.json();
      close();
      router.push(`/widgets/${type}?id=${row.id}`);
    } catch (err) {
      showToast(`Create failed: ${err instanceof Error ? err.message : 'unknown error'}`, 'error');
      setBusy(false);
    }
    */
  };

  const duplicateGoogleReviewsItem = async (
    item: GoogleReviewsItem,
    setList: React.Dispatch<React.SetStateAction<GoogleReviewsItem[]>>
  ) => {
    if (actionInFlightRef.current) return;
    actionInFlightRef.current = true;
    setBusy(true);
    try {
      const res = await fetch('/api/v1/widgets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_id: item.businessId,
          widget_type: item.widgetType,
          name: `${item.name} (Copy)`,
          ...configToDbRow(item.config),
          cached_reviews: item.reviews ?? [],
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const row = await res.json();
      // Add the copy as the first item (top-left of the grid).
      setList((list) => [{ ...item, id: row.id, name: row.name }, ...list]);
      // Refresh server props so a remount doesn't re-initialize from stale data.
      router.refresh();
      showToast(`“${item.name}” duplicated`, 'success');
    } catch (err) {
      showToast(`Duplicate failed: ${err instanceof Error ? err.message : 'unknown error'}`, 'error');
    } finally {
      actionInFlightRef.current = false;
      setBusy(false);
    }
  };

  // --- Modal content -----------------------------------------------------------

  const matches = (id: string, name: string) =>
    !query || name.toLowerCase().includes(query) || id.toLowerCase().includes(query);

  const getFilteredItems = () => {
    if (openType === 'before-after') return beforeAfterItems.filter((i) => matches(i.id, i.name));
    if (openType === 'form') return formItems.filter((i) => matches(i.id, i.name));
    if (openType === 'google-reviews') return googleReviewsItems.filter((i) => matches(i.id, i.name));
    if (openType === 'google-reviews-carousel') return carouselItems.filter((i) => matches(i.id, i.name));
    return [];
  };

  const filteredItems = getFilteredItems();
  const openCount = filteredItems.length;
  const visibleItems = filteredItems;
  const hasMore = listHasMore;

  const renderGoogleReviewsCard = (
    item: GoogleReviewsItem,
    type: 'google-reviews' | 'google-reviews-carousel'
  ) => {
    const isCarousel = type === 'google-reviews-carousel';
    return (
      <WidgetCard
        key={item.id}
        name={item.name}
        editHref={`/widgets/${type}?id=${item.id}`}
        onCopyCode={() =>
          setEmbedTarget({ id: item.id, name: item.name, typeLabel: widgetTypeMeta[type].typeLabel })
        }
        onDuplicate={() =>
          duplicateGoogleReviewsItem(item, isCarousel ? setCarouselItems : setGoogleReviewsItems)
        }
        onDelete={() =>
          requestDelete({ type, id: item.id, name: item.name })
        }
      >
        {isCarousel ? (
          <CarouselThumbnail item={item} />
        ) : (
          <div className="bg-white p-3">
            <GoogleReviewsWidget
              widgetId={item.id}
              config={item.config}
              business={item.business}
              reviews={item.reviews}
              preview
            />
          </div>
        )}
      </WidgetCard>
    );
  };

  const renderModalBody = () => {
    if (openType === 'before-after') {
      return (visibleItems as BeforeAfterItem[]).map((item) => (
        <WidgetCard
          key={item.id}
          name={item.name}
          editHref={`/widgets/before-after?id=${item.id}`}
          onCopyCode={() =>
            setEmbedTarget({ id: item.id, name: item.name, typeLabel: widgetTypeMeta['before-after'].typeLabel })
          }
          onDuplicate={() => duplicateBeforeAfter(item)}
          onDelete={() => requestDelete({ type: 'before-after', id: item.id, name: item.name })}
        >
          <BeforeAfterWidget config={item.config} compact />
        </WidgetCard>
      ));
    }
    if (openType === 'form') {
      return (visibleItems as FormItem[]).map((item) => (
        <WidgetCard
          key={item.id}
          name={item.name}
          editHref={`/widgets/form?id=${item.id}`}
          onCopyCode={() =>
            setEmbedTarget({ id: item.id, name: item.name, typeLabel: widgetTypeMeta['form'].typeLabel })
          }
          onDuplicate={() => duplicateForm(item)}
          onDelete={() => requestDelete({ type: 'form', id: item.id, name: item.name })}
        >
          <FormWidget config={item.config} compact />
        </WidgetCard>
      ));
    }
    if (openType === 'google-reviews') {
      return (visibleItems as GoogleReviewsItem[]).map((item) =>
        renderGoogleReviewsCard(item, 'google-reviews')
      );
    }
    if (openType === 'google-reviews-carousel') {
      return (visibleItems as GoogleReviewsItem[]).map((item) =>
        renderGoogleReviewsCard(item, 'google-reviews-carousel')
      );
    }
    return null;
  };

  const typeCards: {
    key: WidgetTypeKey;
    name: string;
    description: string;
    icon: ReactNode;
    mock: ReactNode;
  }[] = [
    {
      key: 'before-after',
      name: widgetTypeMeta['before-after'].name,
      description: widgetTypeMeta['before-after'].description,
      icon: (
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-700 ring-1 ring-blue-200">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="M21 15l-5-5L5 21" />
          </svg>
        </span>
      ),
      mock: <BeforeAfterMock />,
    },
    {
      key: 'form',
      name: widgetTypeMeta['form'].name,
      description: widgetTypeMeta['form'].description,
      icon: (
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M8 8h8M8 12h8M8 16h5" />
          </svg>
        </span>
      ),
      mock: <FormMock />,
    },
    {
      key: 'google-reviews',
      name: widgetTypeMeta['google-reviews'].name,
      description: widgetTypeMeta['google-reviews'].description,
      icon: (
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700 ring-1 ring-amber-200">
          <span className="text-lg font-bold">G</span>
        </span>
      ),
      mock: <GoogleReviewsMock />,
    },
    {
      key: 'google-reviews-carousel',
      name: widgetTypeMeta['google-reviews-carousel'].name,
      description: widgetTypeMeta['google-reviews-carousel'].description,
      icon: (
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700 ring-1 ring-amber-200">
          <span className="text-lg font-bold">G</span>
        </span>
      ),
      mock: <CarouselMock />,
    },
  ];

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {typeCards.map((card) => (
          <button
            key={card.key}
            type="button"
            onClick={() => openModal(card.key)}
            className="group overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] text-left shadow-[var(--shadow-sm)] transition-colors hover:border-[var(--color-accent)]"
          >
            <div className="h-44 bg-[var(--color-bg-secondary)]">{card.mock}</div>
            <div className="flex items-start gap-3 p-4">
              {card.icon}
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-semibold text-[var(--color-text-primary)]">{card.name}</h2>
                  <span className="text-[var(--color-text-muted)] transition-transform group-hover:translate-x-1">
                    →
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">{card.description}</p>
              </div>
            </div>
          </button>
        ))}
      </div>

      <Modal
        open={!!openType}
        onClose={close}
        title={openType ? widgetTypeMeta[openType].modalTitle : undefined}
        description={listLoading ? 'Loading widgets…' : `${openCount} embeds found`}
        size="xl"
        showClose
      >
        {/* Search + create */}
        <div className="mb-4 flex items-center gap-3">
          <div className="relative flex-1">
            <Input
              type="text"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search by name or ID..."
              iconLeft={
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <circle cx="11" cy="11" r="8" />
                  <path d="M21 21l-4.35-4.35" />
                </svg>
              }
            />
          </div>
          <Button
            type="button"
            onClick={() => {
              if (!openType) return;
              if (openType === 'before-after') createBeforeAfter();
              else if (openType === 'form') createForm();
              else createGoogleReviews(openType);
            }}
            disabled={busy}
            iconLeft={
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path d="M12 5v14M5 12h14" />
              </svg>
            }
          >
            Create New
          </Button>
        </div>

        {/* Grid */}
        {listLoading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-sm text-[var(--color-text-secondary)]">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-accent)] border-t-transparent" />
            Searching for widgets…
          </div>
        ) : listError ? (
          <div className="py-16 text-center text-sm text-[var(--color-danger)]">{listError}</div>
        ) : openCount === 0 ? (
          <div className="py-16 text-center text-sm text-[var(--color-text-secondary)]">
            No embeds found.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {renderModalBody()}
            {loadingMore ? (
              <div
                className="col-span-full flex items-center justify-center gap-2 py-5 text-sm font-medium text-[var(--color-text-secondary)]"
                role="status"
                aria-live="polite"
              >
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--color-accent)] border-t-transparent" />
                Loading more widgets…
              </div>
            ) : hasMore ? (
              <LoadMoreSentinel onLoadMore={loadMore} />
            ) : null}
          </div>
        )}
      </Modal>

      {embedTarget && (
        <EmbedCodeModal
          id={embedTarget.id}
          name={embedTarget.name}
          typeLabel={embedTarget.typeLabel}
          onClose={() => setEmbedTarget(null)}
        />
      )}
    </>
  );
}
