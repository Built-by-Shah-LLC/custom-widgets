'use client';

import { CSSProperties, useEffect, useMemo, useState } from 'react';
import type { BusinessInfo, Review } from '@/lib/reviews-data';
import { selectDisplayedReviews } from '@/lib/review-sort';

import type { WidgetConfig } from '@/lib/widget-config';
import { defaultWidgetConfig, resolveFontFamily, thumbnailSizePx, googlePhotoVariant } from '@/lib/widget-config';
import { GoogleLogo } from './GoogleReviewsWidget';
import { ReviewLightbox, ReviewPhoto } from './ReviewLightbox';

function Avatar({
  name,
  photoUrl,
  size,
  show,
}: {
  name: string;
  photoUrl?: string;
  size: number;
  show: boolean;
}) {
  const [failed, setFailed] = useState(false);

  if (!show) return null;
  const initial = name.charAt(0).toUpperCase();
  const badgeSize = Math.round(size * 0.45);

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      {photoUrl && !failed ? (
        <img
          src={photoUrl}
          alt={name}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          style={{
            width: size,
            height: size,
            borderRadius: '50%',
            objectFit: 'cover',
            display: 'block',
          }}
        />
      ) : (
        <div
          style={{
            width: size,
            height: size,
            borderRadius: '50%',
            background: '#d1d5db',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: size / 2.5,
          }}
        >
          {initial}
        </div>
      )}
      <div
        style={{
          position: 'absolute',
          bottom: -2,
          right: -2,
          width: badgeSize,
          height: badgeSize,
          borderRadius: '50%',
          background: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
        }}
      >
        <GoogleLogo size={Math.round(badgeSize * 0.65)} />
      </div>
    </div>
  );
}

function VerifiedBadge({ size, color }: { size: number; color: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 14 14"
      fill="none"
      style={{ display: 'block', flexShrink: 0 }}
      aria-label="Verified Customer"
      role="img"
    >
      <path
        fill={color}
        d="M6.757.236a.35.35 0 0 1 .486 0l1.106 1.07a.35.35 0 0 0 .329.089l1.493-.375a.35.35 0 0 1 .422.244l.422 1.48a.35.35 0 0 0 .24.24l1.481.423a.35.35 0 0 1 .244.422l-.375 1.493a.35.35 0 0 0 .088.329l1.071 1.106a.35.35 0 0 1 0 .486l-1.07 1.106a.35.35 0 0 0-.089.329l.375 1.493a.35.35 0 0 1-.244.422l-1.48.422a.35.35 0 0 0-.24.24l-.423 1.481a.35.35 0 0 1-.422.244l-1.493-.375a.35.35 0 0 0-.329.088l-1.106 1.071a.35.35 0 0 1-.486 0l-1.106-1.07a.35.35 0 0 0-.329-.089l-1.493.375a.35.35 0 0 1-.422-.244l-.422-1.48a.35.35 0 0 0-.24-.24l-1.481-.423a.35.35 0 0 1-.244-.422l.375-1.493a.35.35 0 0 0-.088-.329L.236 7.243a.35.35 0 0 1 0-.486l1.07-1.106a.35.35 0 0 0 .089-.329L1.02 3.829a.35.35 0 0 1 .244-.422l1.48-.422a.35.35 0 0 0 .24-.24l.423-1.481a.35.35 0 0 1 .422-.244l1.493.375a.35.35 0 0 0 .329-.088L6.757.236Z"
      />
      <path
        fill="#fff"
        fillRule="evenodd"
        d="M9.065 4.85a.644.644 0 0 1 .899 0 .615.615 0 0 1 .053.823l-.053.059L6.48 9.15a.645.645 0 0 1-.84.052l-.06-.052-1.66-1.527a.616.616 0 0 1 0-.882.645.645 0 0 1 .84-.052l.06.052 1.21 1.086 3.034-2.978Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

// Authentic Google logo wordmark (same artwork as the reference popup).
// The viewBox includes internal padding and the "g" descender, so callers
// should baseline-align it (the glyph baseline sits ~11 units above the
// bottom of the 36-unit viewBox).
function GoogleLogoMark({ height, style }: { height: number; style?: CSSProperties }) {
  return (
    <svg
      height={height}
      viewBox="0 0 85 36"
      fill="none"
      style={{ display: 'block', ...style }}
      aria-label="Google"
      role="img"
    >
      <path fill="#4285F4" d="M20.778 13.43h-9.862v2.927h6.994c-.345 4.104-3.76 5.854-6.982 5.854-4.123 0-7.72-3.244-7.72-7.791 0-4.43 3.429-7.841 7.73-7.841 3.317 0 5.272 2.115 5.272 2.115l2.049-2.122s-2.63-2.928-7.427-2.928C4.725 3.644 0 8.8 0 14.367c0 5.457 4.445 10.777 10.988 10.777 5.756 0 9.969-3.942 9.969-9.772 0-1.23-.179-1.941-.179-1.941Z" />
      <path fill="#EA4335" d="M28.857 11.312c-4.047 0-6.947 3.163-6.947 6.853 0 3.744 2.813 6.966 6.994 6.966 3.786 0 6.887-2.893 6.887-6.886 0-4.576-3.607-6.933-6.934-6.933Zm.04 2.714c1.99 0 3.876 1.609 3.876 4.201 0 2.538-1.878 4.192-3.885 4.192-2.205 0-3.945-1.766-3.945-4.212 0-2.394 1.718-4.181 3.954-4.181Z" />
      <path fill="#FBBC05" d="M43.965 11.312c-4.046 0-6.946 3.163-6.946 6.853 0 3.744 2.813 6.966 6.994 6.966 3.785 0 6.886-2.893 6.886-6.886 0-4.576-3.607-6.933-6.934-6.933Zm.04 2.714c1.99 0 3.876 1.609 3.876 4.201 0 2.538-1.877 4.192-3.885 4.192-2.205 0-3.945-1.766-3.945-4.212 0-2.394 1.718-4.181 3.955-4.181Z" />
      <path fill="#4285F4" d="M58.783 11.319c-3.714 0-6.634 3.253-6.634 6.904 0 4.16 3.385 6.918 6.57 6.918 1.97 0 3.017-.782 3.79-1.68v1.363c0 2.384-1.448 3.812-3.633 3.812-2.11 0-3.169-1.57-3.537-2.46l-2.656 1.11c.943 1.992 2.839 4.07 6.215 4.07 3.693 0 6.508-2.327 6.508-7.205V11.734h-2.897v1.17c-.89-.96-2.109-1.585-3.726-1.585Zm.269 2.709c1.821 0 3.69 1.554 3.69 4.21 0 2.699-1.865 4.187-3.73 4.187-1.98 0-3.823-1.608-3.823-4.161 0-2.653 1.914-4.236 3.863-4.236Z" />
      <path fill="#EA4335" d="M78.288 11.302c-3.504 0-6.446 2.788-6.446 6.901 0 4.353 3.28 6.934 6.782 6.934 2.924 0 4.718-1.6 5.789-3.032l-2.389-1.59c-.62.962-1.656 1.902-3.385 1.902-1.943 0-2.836-1.063-3.39-2.094l9.266-3.845-.48-1.126c-.896-2.207-2.984-4.05-5.747-4.05Zm.12 2.658c1.263 0 2.171.671 2.557 1.476l-6.187 2.586c-.267-2.002 1.63-4.062 3.63-4.062Z" />
      <path fill="#34A853" d="M67.425 24.727h3.044V4.359h-3.044v20.368Z" />
    </svg>
  );
}

// Star shape used by the reference popup.
const POPUP_STAR_PATH =
  'M6.82617 11.442L3.54617 13.166C3.46353 13.2093 3.3704 13.2287 3.27732 13.2219C3.18425 13.2151 3.09494 13.1824 3.0195 13.1274C2.94406 13.0725 2.8855 12.9975 2.85045 12.911C2.8154 12.8245 2.80526 12.7299 2.82117 12.638L3.44817 8.98798C3.46192 8.908 3.456 8.82587 3.43091 8.74869C3.40582 8.67151 3.36232 8.6016 3.30417 8.54499L0.650168 5.95899C0.583317 5.89388 0.53602 5.81136 0.51363 5.72076C0.491239 5.63017 0.494647 5.53512 0.52347 5.44637C0.552292 5.35761 0.605378 5.27869 0.676721 5.21854C0.748065 5.15838 0.834818 5.1194 0.927168 5.10599L4.59317 4.57299C4.67344 4.56146 4.7497 4.53059 4.81537 4.48303C4.88105 4.43547 4.93418 4.37265 4.97017 4.29999L6.61017 0.977985C6.65153 0.894518 6.7154 0.824266 6.79455 0.775151C6.87371 0.726037 6.96501 0.700012 7.05817 0.700012C7.15132 0.700012 7.24263 0.726037 7.32178 0.775151C7.40094 0.824266 7.4648 0.894518 7.50617 0.977985L9.14717 4.29899C9.18307 4.37152 9.23604 4.43426 9.30153 4.48182C9.36702 4.52937 9.44308 4.56031 9.52317 4.57199L13.1892 5.10499C13.2815 5.1184 13.3683 5.15738 13.4396 5.21754C13.511 5.27769 13.564 5.35661 13.5929 5.44537C13.6217 5.53412 13.6251 5.62917 13.6027 5.71976C13.5803 5.81036 13.533 5.89288 13.4662 5.95798L10.8132 8.54398C10.7552 8.60049 10.7118 8.67024 10.6867 8.74723C10.6616 8.82422 10.6556 8.90616 10.6692 8.98598L11.2962 12.637C11.3122 12.7291 11.3021 12.8238 11.267 12.9105C11.232 12.9971 11.1733 13.0722 11.0977 13.1272C11.0221 13.1822 10.9326 13.2149 10.8393 13.2215C10.7461 13.2282 10.6528 13.2086 10.5702 13.165L7.29117 11.441C7.21946 11.4033 7.13967 11.3836 7.05867 11.3836C6.97767 11.3836 6.89788 11.4033 6.82617 11.441V11.442Z';

function PopupStar({ filled, color, size }: { filled: boolean; color: string; size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 14 14"
      fill="none"
      style={{ display: 'block' }}
      aria-hidden="true"
    >
      <path d={POPUP_STAR_PATH} fill={filled ? color : '#E4E4E4'} />
    </svg>
  );
}

interface GoogleReviewsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  widgetId?: string;
  config?: WidgetConfig;
  business?: BusinessInfo;
  reviews?: Review[];
  apiOrigin?: string;
}

const EMPTY_REVIEWS: Review[] = [];

export function GoogleReviewsPanel({
  isOpen,
  onClose,
  widgetId,
  config = defaultWidgetConfig,
  business,
  reviews,
  apiOrigin = '',
}: GoogleReviewsPanelProps) {
  const [visibleCount, setVisibleCount] = useState(config.drawerReviewsPerPage);
  const [lightbox, setLightbox] = useState<{ images: string[]; index: number; reviewId: string } | null>(null);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      const resetVisibleCount = window.setTimeout(
        () => setVisibleCount(config.drawerReviewsPerPage),
        0
      );
      return () => {
        window.clearTimeout(resetVisibleCount);
        document.body.style.overflow = '';
      };
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen, config.drawerReviewsPerPage]);

  const businessInfo: BusinessInfo = business ?? {
    name: 'SSR Diesel Repairs',
    address: '',
    totalReviews: 126,
    averageRating: 4.0,
  };

  const displayName =
    config.customBusinessNameEnabled && config.customBusinessName
      ? config.customBusinessName
      : businessInfo.name;

  const fullStars = Math.floor(businessInfo.averageRating);
  const hasHalfStar = businessInfo.averageRating % 1 >= 0.5;

  const reviewItems = reviews ?? EMPTY_REVIEWS;

  const filtered = useMemo(
    () => selectDisplayedReviews(reviewItems, config),
    [reviewItems, config]
  );

  const visible = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  const isLoadingReviews = reviews === undefined;
  const hasNoFetchedReviews = !isLoadingReviews && reviewItems.length === 0;
  const hasNoMatchingReviews = !isLoadingReviews && reviewItems.length > 0 && filtered.length === 0;
  const emptyReviewMessage = hasNoFetchedReviews
    ? 'No reviews fetched yet.'
    : hasNoMatchingReviews
      ? 'No reviews match the current filters.'
      : null;

  const overlayStyle: CSSProperties = {
    position: 'fixed',
    inset: 0,
    zIndex: 99999,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '16px',
    pointerEvents: 'none',
  };

  const popupStyle: CSSProperties = {
    position: 'relative',
    width: `min(${config.drawerWidth}px, 100%)`,
    height: '85vh',
    background: config.drawerBackgroundColor,
    color: config.drawerTextColor,
    borderRadius: '16px',
    boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
    fontFamily: resolveFontFamily(config.fontFamily),
    display: 'flex',
    flexDirection: 'column',
    pointerEvents: 'auto',
  };

  const avatarSize = thumbnailSizePx[config.thumbnailSize];
  const reviewImageSize = thumbnailSizePx[config.reviewImageSize];

  return (
    <>
      {lightbox && (
        <ReviewLightbox
          images={lightbox.images}
          initialIndex={lightbox.index}
          onClose={() => setLightbox(null)}
          apiOrigin={apiOrigin}
          widgetId={widgetId}
          reviewId={lightbox.reviewId}
        />
      )}

      {isOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99998,
            background: 'rgba(0,0,0,0.4)',
          }}
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {isOpen && (
        <div style={overlayStyle}>
          <div
            style={popupStyle}
            role="dialog"
            aria-modal="true"
            aria-label={`${displayName} reviews`}
          >
            {/* Close button */}
            <button
              onClick={onClose}
              style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                border: `1px solid ${config.drawerCardBorderColor}`,
                background: 'none',
                color: config.drawerTextColor,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                opacity: 0.7,
                padding: 0,
              }}
              aria-label="Close"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" style={{ display: 'block' }}>
                <path
                  fillRule="evenodd"
                  fill="currentColor"
                  d="m3.426 2.024.094.083L8 6.586l4.48-4.479a1 1 0 0 1 1.497 1.32l-.083.095L9.414 8l4.48 4.478a1 1 0 0 1-1.32 1.498l-.094-.083L8 9.413l-4.48 4.48a1 1 0 0 1-1.497-1.32l.083-.095L6.585 8 2.106 3.522a1 1 0 0 1 1.32-1.498Z"
                />
              </svg>
            </button>

            {/* Header */}
            <div style={{ padding: '20px 24px 0', textAlign: 'center', flexShrink: 0 }}>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '0 16px 8px',
                  borderBottom: `2px solid ${config.drawerTextColor}`,
                }}
              >
                <GoogleLogo size={18} />
                <span style={{ fontSize: '15px', color: config.drawerTextColor }}>Google</span>
                <span style={{ fontSize: '15px', fontWeight: 700, color: config.drawerTextColor }}>
                  {businessInfo.averageRating.toFixed(1)}
                </span>
              </div>

              <div
                style={{
                  marginTop: '20px',
                  display: 'flex',
                  alignItems: 'baseline',
                  justifyContent: 'center',
                  gap: '8px',
                }}
              >
                <GoogleLogoMark height={24} style={{ transform: 'translateY(7px)' }} />
                <span style={{ fontSize: '22px', fontWeight: 500, color: config.drawerTextColor }}>
                  Reviews
                </span>
              </div>

              {config.drawerShowBusinessInfo && (
                <div
                  style={{
                    marginTop: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                  }}
                >
                  <span style={{ fontSize: '28px', fontWeight: 700, color: config.drawerTextColor }}>
                    {businessInfo.averageRating.toFixed(1)}
                  </span>
                  {config.drawerShowStarRatings && (
                    <div style={{ display: 'flex', gap: '2px' }}>
                      {Array.from({ length: 5 }).map((_, i) => (
                        <PopupStar
                          key={i}
                          size={22}
                          color={config.starColor}
                          filled={i < fullStars || (i === fullStars && hasHalfStar)}
                        />
                      ))}
                    </div>
                  )}
                  <span style={{ fontSize: '15px', opacity: 0.55 }}>
                    ({businessInfo.totalReviews})
                  </span>
                </div>
              )}
            </div>

            {/* Reviews list */}
            <style>{`
              .cw-reviews-popup-list {
                scrollbar-width: thin;
                scrollbar-color: rgba(0,0,0,0.25) transparent;
              }
              .cw-reviews-popup-list::-webkit-scrollbar {
                width: 6px;
              }
              .cw-reviews-popup-list::-webkit-scrollbar-thumb {
                background: rgba(0,0,0,0.25);
                border-radius: 3px;
              }
              .cw-reviews-popup-list::-webkit-scrollbar-track {
                background: transparent;
              }
            `}</style>
            <div
              className="cw-reviews-popup-list"
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '0 24px 24px',
                marginTop: '16px',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {isLoadingReviews ? (
                <div
                  style={{
                    padding: '40px 0',
                    textAlign: 'center',
                    fontSize: '14px',
                    color: config.drawerTextColor,
                    opacity: 0.6,
                  }}
                >
                  Loading reviews…
                </div>
              ) : emptyReviewMessage ? (
                <div
                  style={{
                    padding: '40px 0',
                    textAlign: 'center',
                    fontSize: '14px',
                    color: config.drawerTextColor,
                    opacity: 0.6,
                  }}
                >
                  {emptyReviewMessage}
                </div>
              ) : (
                <>
                  {visible.map((review) => (
                    <div
                      key={review.id}
                      style={{
                        padding: '20px 0',
                        borderTop: `1px solid ${config.drawerCardBorderColor}`,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <Avatar
                          name={review.authorName}
                          photoUrl={review.authorPhotoUrl}
                          size={avatarSize}
                          show={config.drawerShowAuthorPhotos}
                        />
                        <div>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              fontWeight: 600,
                              color: config.drawerTextColor,
                            }}
                          >
                            {review.authorName}
                            <VerifiedBadge size={16} color={config.starColor} />
                          </div>
                          {config.drawerShowDates && (
                            <div style={{ fontSize: '13px', opacity: 0.55 }}>
                              {review.relativeTime}
                            </div>
                          )}
                        </div>
                      </div>

                      {config.drawerShowStarRatings && (
                        <div style={{ marginTop: '8px', display: 'flex', gap: '2px' }}>
                          {Array.from({ length: 5 }).map((_, i) => (
                            <PopupStar key={i} size={18} color={config.starColor} filled={i < review.rating} />
                          ))}
                        </div>
                      )}

                      <p
                        style={{
                          fontSize: '14px',
                          lineHeight: 1.6,
                          margin: '8px 0 0',
                          color: config.drawerTextColor,
                        }}
                      >
                        {review.text}
                      </p>

                      {config.drawerShowReviewImages && (review.images?.length ?? 0) > 0 && (
                        <div style={{ marginTop: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          {review.images!.map((src, i) => (
                            <ReviewPhoto
                              key={`${src}-${i}`}
                              src={googlePhotoVariant(src, reviewImageSize * 2)}
                              size={reviewImageSize}
                              borderRadius={8}
                              onClick={() => setLightbox({ images: review.images!, index: i, reviewId: review.id })}
                              apiOrigin={apiOrigin}
                              widgetId={widgetId}
                              reviewId={review.id}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Load more — inline at the end of the list, visible only at the bottom */}
                  {hasMore && (
                <button
                  onClick={() => setVisibleCount((c) => c + config.drawerReviewsPerPage)}
                  style={{
                    width: '100%',
                    flexShrink: 0,
                    borderRadius: '10px',
                    background: '#DC2626',
                    color: '#000000',
                    border: 'none',
                    padding: '14px',
                    fontSize: '15px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  Load More
                </button>
              )}
            </>
          )}
        </div>
          </div>
        </div>
      )}
    </>
  );
}
