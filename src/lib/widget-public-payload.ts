import type { BusinessInfo } from './reviews-data';
import { formSchemaFingerprint } from './form-config';
import { selectDisplayedReviews } from './review-sort';
import { configFromDbRow } from './widget-config';
import {
  mapBusinessRow,
  mapReviewRow,
  type ApiReview,
  type ReviewRowLike,
} from './widget-mappers';

/** Additive wire version; older bundles ignore this field. */
export const PUBLIC_WIDGET_SCHEMA_VERSION = 1 as const;

export interface PublicReviewsPayload {
  schemaVersion: typeof PUBLIC_WIDGET_SCHEMA_VERSION;
  kind: 'reviews';
  config: Record<string, unknown>;
  business?: BusinessInfo;
  reviews: ApiReview[];
}

export interface PublicBeforeAfterPayload {
  schemaVersion: typeof PUBLIC_WIDGET_SCHEMA_VERSION;
  kind: 'before-after';
  config: Record<string, unknown>;
}

/**
 * Public form config deliberately has a different shape from FormConfig: the
 * latter includes private delivery/storage settings used by editors and the
 * server submitter. Keeping a separate rendering-only marker type means a
 * public read cannot be passed to formToDbRow without an explicit conversion;
 * authenticated editor reads continue to use the full private row.
 */
export interface PublicFormPayload {
  schemaVersion: typeof PUBLIC_WIDGET_SCHEMA_VERSION;
  kind: 'form';
  config: PublicFormConfig;
  schemaFingerprint: string;
}

/** Rendering-only marker type; it intentionally cannot satisfy FormConfig. */
export interface PublicFormConfig {
  id?: string;
  name?: string;
  steps?: unknown[];
  [key: string]: unknown;
}

export type PublicWidgetPayload =
  | PublicReviewsPayload
  | PublicBeforeAfterPayload
  | PublicFormPayload;

function withoutKeys(
  row: Record<string, unknown>,
  keys: readonly string[]
): Record<string, unknown> {
  const excluded = new Set(keys);
  return Object.fromEntries(
    Object.entries(row).filter(([key]) => !excluded.has(key))
  );
}

/** Public form columns; delivery and storage policy never leave the server. */
export const PUBLIC_FORM_COLUMNS = [
  'id',
  'name',
  'steps',
  'logo_url',
  'logo_link_url',
  'logo_width',
  'logo_alignment',
  'font_family',
  'primary_color',
  'background_color',
  'text_color',
  'muted_text_color',
  'error_color',
  'heading_font_size',
  'heading_font_weight',
  'body_font_size',
  'body_font_weight',
  'label_font_size',
  'label_font_weight',
  'border_radius',
  'shadow',
  'max_width',
  'padding',
  'input_background_color',
  'input_border_color',
  'input_border_radius',
  'option_gap',
  'checked_color',
  'prev_label',
  'next_label',
  'submit_label',
  'show_arrows',
  'button_background_color',
  'button_text_color',
  'button_hover_color',
  'show_progress',
  'progress_style',
  'honeypot_enabled',
  'success_heading',
  'success_message',
  'success_redirect_url',
  'success_redirect_delay',
  'error_message',
] as const;

export function publicFormRow(row: Record<string, unknown>): PublicFormConfig {
  const publicRow: Record<string, unknown> = {};
  for (const column of PUBLIC_FORM_COLUMNS) {
    if (column in row) publicRow[column] = row[column];
  }
  return publicRow as PublicFormConfig;
}

export function publicWidgetRow(row: Record<string, unknown>): Record<string, unknown> {
  // `businesses` is represented once at the canonical top-level field below.
  return withoutKeys(row, ['cached_reviews', 'businesses']);
}

/**
 * Reviews a visitor actually needs. The stored cache can hold the full sync
 * (hundreds of rows) so later filter and sort changes stay correct. This
 * applies the widget's current rules and returns only the displayed slice.
 */
export function publicReviewList(row: Record<string, unknown>): ApiReview[] {
  const cachedReviews = Array.isArray(row.cached_reviews) ? row.cached_reviews : [];
  const config = configFromDbRow(row);
  return selectDisplayedReviews(
    cachedReviews.map((review) => mapReviewRow(review as ReviewRowLike)),
    config
  );
}

export function buildReviewsPayload(row: Record<string, unknown>): PublicReviewsPayload {
  const business = mapBusinessRow(row.businesses ?? null) ?? null;
  return {
    schemaVersion: PUBLIC_WIDGET_SCHEMA_VERSION,
    kind: 'reviews',
    config: { ...publicWidgetRow(row), id: row.id },
    reviews: publicReviewList(row),
    ...(business ? { business } : {}),
  };
}

export function buildBeforeAfterPayload(
  row: Record<string, unknown>
): PublicBeforeAfterPayload {
  return {
    schemaVersion: PUBLIC_WIDGET_SCHEMA_VERSION,
    kind: 'before-after',
    config: { ...row, id: row.id },
  };
}

export function buildFormPayload(row: Record<string, unknown>): PublicFormPayload {
  return {
    schemaVersion: PUBLIC_WIDGET_SCHEMA_VERSION,
    kind: 'form',
    config: publicFormRow(row),
    schemaFingerprint: formSchemaFingerprint(row),
  };
}

/**
 * JS serialization for classic script responses. Escaping `<` blocks a
 * closing-script breakout; U+2028/U+2029 remain valid in older JS engines.
 */
export function safeJsString(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export function publicFormResponse(
  row: Record<string, unknown>
): PublicFormConfig & {
  schemaVersion: typeof PUBLIC_WIDGET_SCHEMA_VERSION;
  schemaFingerprint: string;
} {
  return {
    ...publicFormRow(row),
    schemaVersion: PUBLIC_WIDGET_SCHEMA_VERSION,
    schemaFingerprint: formSchemaFingerprint(row),
  };
}
