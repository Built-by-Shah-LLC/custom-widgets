'use client';

import { CSSProperties, useState } from 'react';
import type { BusinessInfo, Review } from '@/lib/reviews-data';
import type { WidgetConfig } from '@/lib/widget-config';
import { defaultWidgetConfig, resolveFontFamily } from '@/lib/widget-config';
import { GoogleReviewsPanel } from './GoogleReviewsPanel';

export function Star({ filled, color, size }: { filled: boolean; color: string; size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? color : 'none'}
      stroke={filled ? color : '#C1C1C1'}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: 'block' }}
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

export function GoogleLogo({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

export function buildBadgeStyles(config: WidgetConfig): {
  wrapper: CSSProperties;
  card: CSSProperties;
  rating: CSSProperties;
  subtitle: CSSProperties;
  cta: CSSProperties;
} {
  const background =
    config.badgeBackgroundType === 'transparent'
      ? 'transparent'
      : config.badgeBackgroundColor;

  const horizontal = config.layout === 'horizontal';
  const compact = config.badgeCompactMode;

  const wrapper: CSSProperties = {
    display: 'inline-flex',
    width: config.fullWidth ? '100%' : undefined,
    maxWidth: '100%',
    minWidth: 0,
    boxSizing: 'border-box',
    justifyContent:
      config.alignment === 'left'
        ? 'flex-start'
        : config.alignment === 'right'
          ? 'flex-end'
          : 'center',
  };

  if (config.position === 'fixed' || config.position === 'absolute') {
    wrapper.position = config.position;
    wrapper.zIndex = 9999;
    if (config.alignment === 'left') {
      wrapper.left = '20px';
      wrapper.right = undefined;
    } else if (config.alignment === 'right') {
      wrapper.right = '20px';
      wrapper.left = undefined;
    } else {
      wrapper.left = '50%';
      wrapper.transform = 'translateX(-50%)';
    }
    wrapper.bottom = '20px';
    wrapper.maxWidth = 'calc(100vw - 40px)';
  }

  const card: CSSProperties = {
    display: 'flex',
    flexDirection: horizontal ? 'row' : 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: horizontal ? 'clamp(8px, 2vw, 20px)' : `${Math.max(config.padding / 2, 6)}px`,
    background,
    borderRadius: `${config.borderRadius}px`,
    padding: compact
      ? `${config.padding}px ${Math.max(config.padding, 8)}px`
      : `${config.padding * 1.5}px 16px`,
    fontFamily: resolveFontFamily(config.fontFamily),
    cursor: 'pointer',
    transition: 'transform 0.2s ease-out',
    width: config.fullWidth ? '100%' : undefined,
    maxWidth: '100%',
    minWidth: 0,
    boxSizing: 'border-box',
    textAlign: 'center',
    position: 'relative',
    border:
      config.badgeBackgroundType === 'solid'
        ? `1px solid ${config.badgeBorderColor}`
        : undefined,
    boxShadow:
      config.badgeBackgroundType === 'solid'
        ? '0 4px 20px rgba(0,0,0,0.08)'
        : undefined,
  };

  const rating: CSSProperties = {
    fontSize: `${config.starSize + 6}px`,
    fontWeight: 700,
    color: config.textColor,
    lineHeight: 1,
    flexShrink: 0,
  };

  const subtitle: CSSProperties = {
    fontSize: compact ? '11px' : '12px',
    fontWeight: 400,
    color: config.textColor,
    opacity: 0.7,
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    flexWrap: 'wrap',
    justifyContent: 'center',
    width: horizontal ? undefined : '100%',
    maxWidth: '100%',
    minWidth: 0,
    flex: horizontal ? '1 1 auto' : undefined,
    textAlign: 'center',
    marginBottom: config.ctaEnabled && !horizontal ? '12px' : undefined,
  };

  const cta: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '7px',
    borderRadius: '9999px',
    background: config.ctaBackgroundColor,
    color: config.ctaTextColor,
    border: `1px solid ${config.badgeBorderColor}`,
    padding: compact ? '5px 10px' : '6px 14px',
    fontSize: compact ? '10px' : '11px',
    fontWeight: 600,
    boxShadow: '0 2px 6px rgba(0, 0, 0, 0.12)',
    position: horizontal ? 'static' : 'absolute',
    bottom: horizontal ? undefined : '-10px',
    left: horizontal ? undefined : '50%',
    transform: horizontal ? undefined : 'translateX(-50%)',
    whiteSpace: 'nowrap',
    maxWidth: horizontal ? '100%' : 'calc(100% - 8px)',
    minWidth: 0,
    boxSizing: 'border-box',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  };

  return { wrapper, card, rating, subtitle, cta };
}

interface GoogleReviewsWidgetProps {
  widgetId?: string;
  config?: WidgetConfig;
  business?: BusinessInfo;
  reviews?: Review[];
  preview?: boolean;
  apiOrigin?: string;
}

export function GoogleReviewsWidget({
  widgetId,
  config = defaultWidgetConfig,
  business,
  reviews,
  preview = false,
  apiOrigin = '',
}: GoogleReviewsWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [hover, setHover] = useState(false);

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
  const styles = buildBadgeStyles(config);
  const horizontal = config.layout === 'horizontal';

  const subtitleParts: string[] = [];
  if (config.badgeShowBusinessName) subtitleParts.push(displayName);
  if (config.badgeShowReviewCount) subtitleParts.push(`${businessInfo.totalReviews} reviews`);

  const subtitleEl =
    subtitleParts.length > 0 ? (
      <div style={styles.subtitle}>
        {subtitleParts.flatMap((part, i) =>
          i === 0
            ? [
                <span key={part} style={{ textAlign: 'center' }}>
                  {part}
                </span>,
              ]
            : [
                <span key={`${part}-dot`} style={{ flexShrink: 0 }}>
                  ·
                </span>,
                <span key={part} style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
                  {part}
                </span>,
              ],
        )}
      </div>
    ) : null;

  const openPanel = () => setIsOpen(true);

  return (
    <>
      <div
        style={styles.wrapper}
        className="custom-widget-badge-wrapper"
        data-bbs-widget="reviews"
        data-bbs-widget-id={widgetId || undefined}
      >
        <div
          style={{
            ...styles.card,
            transform: hover && config.position === 'inline' ? 'scale(1.05)' : styles.card.transform,
          }}
          onClick={openPanel}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              openPanel();
            }
          }}
        >
          {horizontal ? (
            <>
              <GoogleLogo size={config.googleIconSize} />
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={styles.rating}>{businessInfo.averageRating.toFixed(1)}</span>
                <div style={{ display: 'flex' }}>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      size={config.starSize}
                      color={config.starColor}
                      filled={i < fullStars || (i === fullStars && hasHalfStar)}
                    />
                  ))}
                </div>
              </div>
              {subtitleEl}
              {config.ctaEnabled && (
                <div style={styles.cta}>
                  {config.ctaShowGoogleLogo && <GoogleLogo size={config.badgeCompactMode ? 13 : 15} />}
                  {config.ctaText}
                </div>
              )}
            </>
          ) : (
            <>
              <GoogleLogo size={config.googleIconSize} />
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={styles.rating}>{businessInfo.averageRating.toFixed(1)}</span>
                <div style={{ display: 'flex' }}>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      size={config.starSize}
                      color={config.starColor}
                      filled={i < fullStars || (i === fullStars && hasHalfStar)}
                    />
                  ))}
                </div>
              </div>
              {subtitleEl}
              {config.ctaEnabled && (
                <div style={styles.cta}>
                  {config.ctaShowGoogleLogo && <GoogleLogo size={config.badgeCompactMode ? 13 : 15} />}
                  {config.ctaText}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {!preview && (
        <GoogleReviewsPanel
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
          config={config}
          business={businessInfo}
          reviews={reviews}
          apiOrigin={apiOrigin}
        />
      )}
    </>
  );
}
