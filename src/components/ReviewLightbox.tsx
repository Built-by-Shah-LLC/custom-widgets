'use client';

import { useCallback, useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { reviewImageProxyUrl } from '@/lib/review-images';

export function ReviewLightbox({
  images,
  initialIndex,
  onClose,
  apiOrigin = '',
  widgetId,
  reviewId,
}: {
  images: string[];
  initialIndex: number;
  onClose: () => void;
  apiOrigin?: string;
  widgetId?: string;
  reviewId?: string;
}) {
  const [index, setIndex] = useState(initialIndex);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [displaySrc, setDisplaySrc] = useState(images[initialIndex]);

  const handleImageElement = useCallback((image: HTMLImageElement | null) => {
    // Cached images can already be complete before the framework observes a
    // load event. Clear the spinner from the element's actual state too.
    if (image?.complete && image.naturalWidth > 0) setLoading(false);
  }, []);

  const show = useCallback((nextIndex: number) => {
    if (nextIndex < 0 || nextIndex >= images.length) return;
    setLoading(true);
    setFailed(false);
    setDisplaySrc(images[nextIndex]);
    setIndex(nextIndex);
  }, [images]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowLeft') show(index - 1);
      if (event.key === 'ArrowRight') show(index + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, onClose, show]);

  useEffect(() => {
    for (const nearbyIndex of [index - 1, index + 1]) {
      if (nearbyIndex >= 0 && nearbyIndex < images.length) {
        const preload = new Image();
        preload.referrerPolicy = 'no-referrer';
        preload.src = images[nearbyIndex];
      }
    }
  }, [images, index]);

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Review photo"
      style={{
        position: 'fixed', inset: 0, zIndex: 100000, background: 'rgba(0, 0, 0, 0.86)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 'clamp(8px, 2vw, 24px)', cursor: 'zoom-out', boxSizing: 'border-box',
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center',
          minWidth: loading ? 'min(280px, calc(100vw - 16px))' : undefined,
          minHeight: loading ? 'min(180px, calc(100dvh - 16px))' : undefined,
          maxWidth: 'calc(100vw - 16px)', maxHeight: 'calc(100dvh - 16px)',
        }}
      >
        {loading && <PhotoSpinner size={44} />}
        {failed && (
          <div style={{ color: '#fff', fontSize: '14px', padding: '24px' }}>
            Photo unavailable
          </div>
        )}
        {!failed && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            ref={handleImageElement}
            key={displaySrc}
            src={displaySrc}
            alt={`Review photo ${index + 1} of ${images.length}`}
            referrerPolicy="no-referrer"
            onLoad={() => setLoading(false)}
            onError={() => {
              const fallback = reviewImageProxyUrl(images[index], apiOrigin, { widgetId, reviewId });
              if (displaySrc !== fallback) {
                setDisplaySrc(fallback);
                return;
              }
              setLoading(false);
              setFailed(true);
            }}
            style={{
              display: 'block', maxWidth: '100%', maxHeight: 'calc(100dvh - 16px)', borderRadius: '8px',
              boxShadow: '0 12px 40px rgba(0, 0, 0, 0.5)', objectFit: 'contain',
              opacity: loading ? 0 : 1, transition: 'opacity 150ms ease',
            }}
          />
        )}
        {index > 0 && (
          <LightboxButton label="Previous photo" side="left" onClick={() => show(index - 1)}>
            <path d="m15 18-6-6 6-6" />
          </LightboxButton>
        )}
        {index < images.length - 1 && (
          <LightboxButton label="Next photo" side="right" onClick={() => show(index + 1)}>
            <path d="m9 18 6-6-6-6" />
          </LightboxButton>
        )}
        <button type="button" onClick={onClose} aria-label="Close photo viewer" style={{
          position: 'absolute', top: '4px', right: '4px', width: '30px', height: '30px', padding: 2,
          borderRadius: '9999px', border: 'none', background: 'rgba(0, 0, 0, 0.62)', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export function ReviewPhoto({
  src,
  size,
  borderRadius,
  onClick,
  apiOrigin = '',
  widgetId,
  reviewId,
  loadingStrategy = 'lazy',
}: {
  src: string;
  size: number;
  borderRadius: number;
  onClick: () => void;
  apiOrigin?: string;
  widgetId?: string;
  reviewId?: string;
  loadingStrategy?: 'eager' | 'lazy';
}) {
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [displaySrc, setDisplaySrc] = useState(src);

  const handleImageElement = useCallback((image: HTMLImageElement | null) => {
    if (image?.complete && image.naturalWidth > 0) setLoading(false);
  }, []);

  if (failed) return null;

  return (
    <button type="button" onClick={onClick} aria-label="Open review photo" style={{
      position: 'relative', width: `${size}px`, height: `${size}px`, flexShrink: 0, padding: 0,
      overflow: 'hidden', borderRadius: `${borderRadius}px`, border: 'none', background: '#E5E7EB',
      cursor: 'zoom-in', display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {loading && <PhotoSpinner size={Math.min(28, Math.max(18, size * 0.35))} dark />}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img ref={handleImageElement} src={displaySrc} alt="" loading={loadingStrategy} decoding="async" referrerPolicy="no-referrer" onLoad={() => setLoading(false)} onError={() => {
        const fallback = reviewImageProxyUrl(src, apiOrigin, { widgetId, reviewId });
        if (displaySrc !== fallback) {
          setDisplaySrc(fallback);
          return;
        }
        setLoading(false);
        setFailed(true);
      }} style={{
        position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover',
        opacity: loading ? 0 : 1, transition: 'opacity 150ms ease',
      }} />
    </button>
  );
}

function PhotoSpinner({ size, dark = false }: { size: number; dark?: boolean }) {
  return (
    <svg aria-label="Loading photo" width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ position: 'absolute' }}>
      <circle cx="12" cy="12" r="9" stroke={dark ? '#6B7280' : 'rgba(255,255,255,.35)'} strokeWidth="3" />
      <path d="M12 3a9 9 0 0 1 9 9" stroke={dark ? '#111827' : '#FFFFFF'} strokeWidth="3" strokeLinecap="round">
        <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.75s" repeatCount="indefinite" />
      </path>
    </svg>
  );
}

function LightboxButton({ label, side, onClick, children }: {
  label: string;
  side: 'left' | 'right';
  onClick: () => void;
  children: ReactNode;
}) {
  const position: CSSProperties = side === 'left' ? { left: '4px' } : { right: '4px' };
  return (
    <button type="button" aria-label={label} onClick={onClick} style={{
      position: 'absolute', top: '50%', ...position, transform: 'translateY(-50%)',
      width: '30px', height: '30px', padding: 2, borderRadius: '9999px', border: 'none',
      background: 'rgba(0, 0, 0, 0.62)', color: '#fff', display: 'flex',
      alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
    }}>
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </button>
  );
}
