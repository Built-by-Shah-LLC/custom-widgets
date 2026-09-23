'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { WidgetConfig } from '@/lib/widget-config';
import { resolveFontFamily, thumbnailSizePx, googlePhotoVariant } from '@/lib/widget-config';
import type { BusinessInfo, Review } from '@/lib/reviews-data';
import { selectDisplayedReviews } from '@/lib/review-sort';
import { GoogleLogo } from './GoogleReviewsWidget';
import { ReviewLightbox, ReviewPhoto } from './ReviewLightbox';

function Star({ size, color, filled }: { size: number; color: string; filled: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? color : 'none'}
      stroke={filled ? color : '#D1D5DB'}
      strokeWidth="2"
      style={{ display: 'block', flexShrink: 0 }}
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

function VerifiedBadge({ color }: { color: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" style={{ display: 'block', flexShrink: 0 }}>
      <circle cx="12" cy="12" r="10" fill={color} />
      <path d="M8 12.5l2.5 2.5L16 9.5" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Google Reviews Carousel — paginated row of review cards with dots/arrows.
 * Inline styles only so it works inside the Shadow DOM embed bundle.
 */
export function GoogleReviewsCarousel({
  config,
  business,
  reviews = [],
  disableResponsive = false,
  apiOrigin = '',
}: {
  config: WidgetConfig;
  business?: BusinessInfo;
  reviews?: Review[];
  /** Skip the per-slide breakpoints — previews always show the configured count. */
  disableResponsive?: boolean;
  apiOrigin?: string;
}) {
  const [page, setPage] = useState(0);
  const [lightbox, setLightbox] = useState<{ images: string[]; index: number } | null>(null);
  const slideRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);
  const [viewportWidth, setViewportWidth] = useState<number | null>(null);

  const filtered = useMemo(
    () => selectDisplayedReviews(reviews, config),
    [reviews, config]
  );

  // Responsive breakpoints (embed only), based on the screen/viewport width:
  // configured count above 1024px, 2 cards at 768–1024px, 1 card below 768px.
  const perSlide = Math.max(
    1,
    disableResponsive || viewportWidth == null
      ? config.carouselReviewsPerSlide
      : viewportWidth < 768
        ? 1
        : viewportWidth < 1024
          ? Math.min(config.carouselReviewsPerSlide, 2)
          : config.carouselReviewsPerSlide
  );
  const { pages, pageCount, currentPage } = useMemo(() => {
    const pages: Review[][] = [];
    for (let i = 0; i < filtered.length; i += perSlide) {
      pages.push(filtered.slice(i, i + perSlide));
    }
    const pageCount = pages.length;
    const currentPage = Math.min(page, Math.max(0, pageCount - 1));
    return { pages, pageCount, currentPage };
  }, [filtered, perSlide, page]);

  useEffect(() => {
    if (!config.carouselAutoplay || pageCount <= 1) return;
    const timer = setInterval(() => {
      setPage((p) => (p + 1) % pageCount);
    }, 4000);
    return () => clearInterval(timer);
  }, [config.carouselAutoplay, pageCount]);

  // Track the viewport width so the per-slide count can adapt to screen size.
  useEffect(() => {
    const update = () => setViewportWidth(window.innerWidth);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // Pin the viewport to the tallest slide's height so the pagination below
  // never moves when navigating between short and tall slides.
  useEffect(() => {
    const els = slideRefs.current.filter((el): el is HTMLDivElement => el !== null);
    if (els.length === 0) return;
    const update = () => {
      setViewportHeight(Math.max(...els.map((el) => el.offsetHeight)));
    };
    update();
    const ro = new ResizeObserver(update);
    els.forEach((el) => ro.observe(el));
    return () => ro.disconnect();
  }, [config, reviews, pageCount]);

  const primary = config.starColor;
  const textColor = config.textColor;
  const avatarSize = thumbnailSizePx[config.thumbnailSize];

  const widthStyle: CSSProperties =
    config.carouselWidthType === 'fixed'
      ? { width: `${config.carouselWidthValue}px`, maxWidth: '100%' }
      : { width: `${config.carouselWidthValue}%` };

  const cardStyle: CSSProperties = {
    flex: '1 1 0',
    minWidth: 0,
    boxSizing: 'border-box',
    background: config.drawerCardBackgroundColor,
    border: `1px solid ${config.drawerCardBorderColor}`,
    borderRadius: `${config.drawerCardRadius}px`,
    padding: `${config.carouselCardPadding}px`,
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  };

  const arrowStyle: CSSProperties = {
    width: '36px',
    height: '36px',
    borderRadius: '9999px',
    border: '1px solid rgba(0, 0, 0, 0.08)',
    background: '#FFFFFF',
    color: '#1F2937',
    boxShadow: '0 1px 4px rgba(0, 0, 0, 0.15)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    flexShrink: 0,
  };

  const renderCard = (review: Review, loadImagesEagerly: boolean) => (
    <div key={review.id} style={cardStyle}>
      {/* Author */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {config.drawerShowAuthorPhotos &&
          (review.authorPhotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={googlePhotoVariant(review.authorPhotoUrl, Math.round(avatarSize / 1.5))}
              alt={review.authorName}
              loading="lazy"
              referrerPolicy="no-referrer"
              style={{
                width: `${avatarSize / 1.5}px`,
                height: `${avatarSize / 1.5}px`,
                borderRadius: '9999px',
                objectFit: 'cover',
                flexShrink: 0,
              }}
            />
          ) : (
            <span
              style={{
                width: `${avatarSize / 1.5}px`,
                height: `${avatarSize / 1.5}px`,
                borderRadius: '9999px',
                background: primary,
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: '16px',
                flexShrink: 0,
              }}
            >
              {review.authorName.charAt(0).toUpperCase()}
            </span>
          ))}
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontWeight: 600,
              fontSize: '14px',
              color: textColor,
            }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {review.authorName}
            </span>
            <VerifiedBadge color={primary} />
          </div>
          {config.drawerShowDates && (
            <div style={{ fontSize: '12px', color: textColor, opacity: 0.55 }}>
              {review.relativeTime}
            </div>
          )}
        </div>
      </div>

      {/* Stars */}
      {config.drawerShowStarRatings && (
        <div style={{ display: 'flex', gap: '2px' }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <Star key={i} size={16} color={primary} filled={i < review.rating} />
          ))}
        </div>
      )}

      {/* Text */}
      {review.text && (
        <div
          className="cw-carousel-text"
          style={{
            fontSize: '14px',
            lineHeight: 1.5,
            color: textColor,
            maxHeight: `${config.carouselTextMaxHeight}px`,
            overflowY: 'auto',
            // Without this, overflow-y:auto forces overflow-x to compute as
            // auto too (CSS spec), making cards horizontally scrollable on
            // touch devices when text contains long unbreakable strings.
            overflowX: 'hidden',
            // Keep the thin scrollbar from overlapping the text.
            paddingRight: '10px',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {review.text}
        </div>
      )}

      {/* Review images */}
      {config.drawerShowReviewImages && (review.images?.length ?? 0) > 0 && (
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {review.images!.map((src, i) => (
            <ReviewPhoto
              key={`${src}-${i}`}
              src={googlePhotoVariant(src, avatarSize * 2)}
              size={avatarSize}
              borderRadius={6}
              onClick={() => setLightbox({ images: review.images!, index: i })}
              apiOrigin={apiOrigin}
              loadingStrategy={loadImagesEagerly ? 'eager' : 'lazy'}
            />
          ))}
        </div>
      )}

      {/* Footer */}
      <div
        style={{
          marginTop: 'auto',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          fontSize: '12px',
          color: textColor,
          opacity: 0.6,
        }}
      >
        Posted on <GoogleLogo size={14} /> Google
      </div>
    </div>
  );

  return (
    <div
      data-bbs-widget="carousel"
      style={{
        ...widthStyle,
        ...(config.carouselMaxWidthEnabled
          ? { maxWidth: `${config.carouselMaxWidth}px` }
          : {}),
        margin: '0 auto',
        boxSizing: 'border-box',
        // Insurance against any child poking out sideways on small screens —
        // the widget must never make the host page horizontally scrollable.
        overflowX: 'hidden',
        fontFamily: config.useSiteTheme ? 'inherit' : resolveFontFamily(config.fontFamily),
        background:
          config.badgeBackgroundType === 'solid' ? config.badgeBackgroundColor : 'transparent',
        borderRadius: `${config.borderRadius}px`,
        padding: '8px 0',
      }}
    >
      {/* Thin rounded scrollbar for review text (works in Shadow DOM embeds
          because the style tag is rendered inside the widget root) */}
      <style>{`
        .cw-carousel-text { scrollbar-width: thin; scrollbar-color: rgba(0, 0, 0, 0.3) transparent; }
        .cw-carousel-text::-webkit-scrollbar { width: 5px; }
        .cw-carousel-text::-webkit-scrollbar-track { background: transparent; }
        .cw-carousel-text::-webkit-scrollbar-thumb { background: rgba(0, 0, 0, 0.3); border-radius: 9999px; }
      `}</style>

      {lightbox && <ReviewLightbox images={lightbox.images} initialIndex={lightbox.index} onClose={() => setLightbox(null)} apiOrigin={apiOrigin} />}

      {/* Header */}
      {(config.drawerShowBusinessInfo || config.carouselShowOverallRating) && business && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '4px',
            marginBottom: '16px',
            color: textColor,
          }}
        >
          {config.drawerShowBusinessInfo && (
            <div style={{ fontSize: '16px', fontWeight: 600 }}>{business.name}</div>
          )}
          {config.carouselShowOverallRating && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ display: 'flex', gap: '2px' }}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} size={16} color={primary} filled={i < Math.round(business.averageRating)} />
                ))}
              </div>
              <span style={{ fontSize: '14px', fontWeight: 600 }}>
                {business.averageRating.toFixed(1)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Viewport */}
      {filtered.length === 0 ? (
        <div
          style={{
            padding: '40px 16px',
            textAlign: 'center',
            fontSize: '14px',
            color: textColor,
            opacity: 0.55,
          }}
        >
          No reviews to display.
        </div>
      ) : (
      <div
        style={{
          overflow: 'hidden',
          height: viewportHeight != null ? `${viewportHeight}px` : 'auto',
          transition: 'height 0.35s ease-in-out',
        }}
      >
        <div
          style={{
            display: 'flex',
            // Keep each slide's height at its own content instead of
            // stretching all slides to the tallest one.
            alignItems: 'flex-start',
            transform: `translateX(-${currentPage * 100}%)`,
            transition: 'transform 0.35s ease-in-out',
          }}
        >
          {pages.map((pageReviews, i) => (
            <div
              key={i}
              ref={(el) => {
                slideRefs.current[i] = el;
              }}
              style={{
                flex: '0 0 100%',
                // Without this the flex item's automatic minimum (its
                // min-content) clamps the slide wider than the viewport and
                // the last card gets cut off horizontally.
                minWidth: 0,
                display: 'flex',
                // Cards take their own content height (not stretched per row).
                alignItems: 'flex-start',
                gap: `${config.carouselCardGap}px`,
                padding: '2px',
                boxSizing: 'border-box',
              }}
            >
              {pageReviews.map((review) => renderCard(review, i === currentPage))}
            </div>
          ))}
        </div>
      </div>
      )}

      {/* Controls */}
      {pageCount > 1 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '14px',
            marginTop: '16px',
          }}
        >
          <button
            type="button"
            onClick={() => setPage((currentPage - 1 + pageCount) % pageCount)}
            style={arrowStyle}
            aria-label="Previous reviews"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          {viewportWidth != null && viewportWidth < 768 ? (
            // Compact "n / N" indicator on small screens — a long row of
            // dots (one per review) would overflow the widget.
            <span
              aria-live="polite"
              style={{
                fontSize: '14px',
                fontWeight: 600,
                color: textColor,
                minWidth: '56px',
                textAlign: 'center',
                userSelect: 'none',
              }}
            >
              {currentPage + 1} / {pageCount}
            </span>
          ) : (
          <div style={{ display: 'flex', gap: '6px' }}>
            {pages.map((_, i) => (
              <button
                key={i}
                type="button"
                className="ui-control"
                onClick={() => setPage(i)}
                aria-label={`Go to slide ${i + 1}`}
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '9999px',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  background: i === currentPage ? primary : textColor,
                  opacity: i === currentPage ? 1 : 0.25,
                }}
              />
            ))}
          </div>
          )}
          <button
            type="button"
            onClick={() => setPage((currentPage + 1) % pageCount)}
            style={arrowStyle}
            aria-label="Next reviews"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
