import type { ComponentType } from 'react';
import { GoogleReviewsEmbed } from './components/GoogleReviewsEmbed';
import { GoogleReviewsCarouselEmbed } from './components/GoogleReviewsCarouselEmbed';
import { BeforeAfterEmbed } from './components/BeforeAfterEmbed';
import { FormEmbed } from './components/FormEmbed';
import type { BootstrapData } from './lib/bootstrap';

export type WidgetComponent = ComponentType<{
  widgetId: string;
  apiOrigin?: string;
  /** Captured, runtime-validated bootstrap snapshot for this mount. */
  bootstrap?: BootstrapData;
}>;

/**
 * Maps widget IDs to { kind, component }. The kind tells the embed loader
 * which endpoints to prefetch without comparing component references (spec
 * amendment 7).
 *
 * The loader supports these data attributes:
 *   <div data-bbs-embed="WIDGET_ID"></div>          (current)
 *   <div data-custom-widget="WIDGET_ID"></div>      (generic)
 *   <div data-designdetail-embed="WIDGET_ID"></div> (legacy, pre-rebrand)
 *
 * The registry preserves support for legacy one-script snippets. New snippets
 * carry bootstrap data, from which their component is resolved at runtime, so
 * newly created widgets work immediately without a code deploy.
 */
export type WidgetKind = 'reviews' | 'carousel' | 'before-after' | 'form';

interface RegistryEntry {
  kind: WidgetKind;
  component: WidgetComponent;
}

const registry: Record<string, RegistryEntry> = {
  // SSR Diesel Repairs — Google Reviews badge
  '004a7b18-6bcc-4b2a-a8f9-454012312690': {
    kind: 'reviews',
    component: GoogleReviewsEmbed as WidgetComponent,
  },
  // GARYS AUTO COLLISION CENTER — Google Reviews badge
  '1cb98d3c-e962-45be-8fac-5859aa7143b8': {
    kind: 'reviews',
    component: GoogleReviewsEmbed as WidgetComponent,
  },
  // GARYS AUTO COLLISION CENTER — ALIS Audi Q5 Before/After Slider
  'a4462581-5eff-453d-9509-b00ce07fb6aa': {
    kind: 'before-after',
    component: BeforeAfterEmbed as WidgetComponent,
  },
  // GARYS AUTO COLLISION CENTER — BMW X7 X40i Before/After Slider
  '63ad3cd4-2a31-4b91-b965-f54b9335e8e3': {
    kind: 'before-after',
    component: BeforeAfterEmbed as WidgetComponent,
  },
  // GARYS AUTO COLLISION CENTER — S Class Before/After Slider
  'db03edac-813a-4e04-881a-9eb122e2053e': {
    kind: 'before-after',
    component: BeforeAfterEmbed as WidgetComponent,
  },
  // GARYS AUTO COLLISION CENTER — Google Reviews Carousel
  '7f3a9c2e-4b1d-4e8f-9a6c-2d5e8f1a3b7c': {
    kind: 'carousel',
    component: GoogleReviewsCarouselEmbed as WidgetComponent,
  },
};

export function getWidgetComponent(widgetId: string): WidgetComponent | null {
  return registry[widgetId]?.component ?? null;
}

export function getWidgetKind(widgetId: string): WidgetKind | null {
  return registry[widgetId]?.kind ?? null;
}

export function getBootstrappedWidgetKind(data: BootstrapData): WidgetKind {
  if (data.kind === 'before-after') return 'before-after';
  if (data.kind === 'form') return 'form';
  return data.config.widget_type === 'google_reviews_carousel'
    ? 'carousel'
    : 'reviews';
}

export function getBootstrappedWidgetComponent(data: BootstrapData): WidgetComponent {
  switch (getBootstrappedWidgetKind(data)) {
    case 'before-after':
      return BeforeAfterEmbed as WidgetComponent;
    case 'form':
      return FormEmbed as WidgetComponent;
    case 'carousel':
      return GoogleReviewsCarouselEmbed as WidgetComponent;
    default:
      return GoogleReviewsEmbed as WidgetComponent;
  }
}

export function listWidgetIds(): string[] {
  return Object.keys(registry);
}
