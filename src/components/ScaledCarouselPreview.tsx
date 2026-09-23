'use client';

import { useEffect, useRef, useState } from 'react';
import type { BusinessInfo, Review } from '@/lib/reviews-data';
import type { WidgetConfig } from '@/lib/widget-config';
import { GoogleReviewsCarousel } from './GoogleReviewsCarousel';

interface ScaledCarouselPreviewProps {
  widgetId?: string;
  config: WidgetConfig;
  business?: BusinessInfo;
  reviews: Review[];
  referenceWidth?: number;
}

/**
 * Renders a Google Reviews Carousel at a reference width and scales it down
 * so it always fits the available container without horizontal scrolling.
 * The scaled content is absolutely positioned so its original width never
 * affects the page layout. The configured number of cards per slide is
 * preserved.
 */
export function ScaledCarouselPreview({
  widgetId,
  config,
  business,
  reviews,
  referenceWidth = 1200,
}: ScaledCarouselPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [geom, setGeom] = useState({
    scale: 1,
    left: 0,
    height: 0,
  });

  useEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;

    const update = () => {
      const containerWidth = container.clientWidth;
      const contentWidth = content.scrollWidth || referenceWidth;
      const contentHeight = content.scrollHeight || 1;

      // Never enlarge; only scale down to fit.
      const scale =
        contentWidth > containerWidth ? containerWidth / contentWidth : 1;
      const scaledWidth = contentWidth * scale;

      setGeom({
        scale,
        left: (containerWidth - scaledWidth) / 2,
        height: Math.round(contentHeight * scale),
      });
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(container);
    ro.observe(content);
    return () => ro.disconnect();
  }, [config, business, reviews, referenceWidth]);

  return (
    <div
      ref={containerRef}
      className="relative w-full"
      style={{ height: geom.height || 'auto' }}
    >
      <div
        ref={contentRef}
        style={{
          position: 'absolute',
          top: 0,
          left: geom.left,
          width: referenceWidth,
          transform: `scale(${geom.scale})`,
          transformOrigin: 'top left',
        }}
      >
        <GoogleReviewsCarousel
          widgetId={widgetId}
          config={{
            ...config,
            // Give scrollable review text extra height in preview so cards
            // can be narrower without clipping content.
            carouselTextMaxHeight: 600,
          }}
          business={business}
          reviews={reviews}
          disableResponsive
        />
      </div>
    </div>
  );
}
