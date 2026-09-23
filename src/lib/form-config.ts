// Multi-Step Form widget configuration types + defaults.
// Mirrors the `form_widgets` table columns in
// supabase/migrations/017_form_widgets.sql. Steps and fields are a nested,
// variable-length structure so they live in the `steps` JSONB column; the
// scalar settings below are flat columns.
//
// This module is bundled into the Preact embed (public/widget.js) and also
// imported by the server-side submit route, so it must stay dependency-free.

export type FormFieldType =
  | 'text'
  | 'phone'
  | 'email'
  | 'textarea'
  | 'radio'
  | 'checkbox-group'
  | 'select'
  | 'number'
  | 'date'
  | 'hidden'
  | 'static-text';

export type VisibilityOperator =
  | 'equals'
  | 'not-equals'
  | 'contains'
  | 'selected';

export type Shadow = 'default' | 'none' | 'soft' | 'strong';
export type ProgressStyle = 'bar' | 'steps';
export type LogoAlignment = 'left' | 'center' | 'right';

export interface FormVisibilityRule {
  /** Field id this rule watches. */
  field: string;
  operator: VisibilityOperator;
  /** Comparison value — option label for radio/checkbox/select rules. */
  value: string;
}

export interface FormFieldValidation {
  required?: boolean;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  minSelections?: number;
  maxSelections?: number;
}

export interface FormFieldOption {
  id: string;
  label: string;
}

export interface FormField {
  id: string;
  type: FormFieldType;
  label: string;
  /** Keep a meaningful submission label without repeating the step heading. */
  hideLabel?: boolean;
  placeholder?: string;
  required: boolean;
  defaultValue?: string;
  /** radio | checkbox-group | select */
  options?: FormFieldOption[];
  validation?: FormFieldValidation;
  visibilityRule?: FormVisibilityRule;
  /** Per-field style overrides (keys match the global style columns). */
  styleOverrides?: Record<string, unknown>;
}

export interface FormStep {
  id: string;
  heading: string;
  description?: string;
  footerNote?: string;
  visibilityRule?: FormVisibilityRule;
  styleOverrides?: Record<string, unknown>;
  fields: FormField[];
}

export interface FormConfig {
  steps: FormStep[];

  /**
   * Mapper metadata, never a database column. A public rendering payload does
   * not contain delivery/storage policy, so formToDbRow must not turn its
   * fallback values into an update that clears or enables those settings.
   * Configs created by the editor/defaultFormConfig leave this undefined and
   * therefore serialize all private fields as before.
   */
  __privateDeliveryFieldsPresent?: FormPrivateDeliveryFieldPresence;

  // Logo
  logoUrl: string;
  logoLinkUrl: string;
  logoWidth: number;
  logoAlignment: LogoAlignment;

  // Global typography / colors
  fontFamily: string;
  primaryColor: string;
  backgroundColor: string;
  textColor: string;
  mutedTextColor: string;
  errorColor: string;
  headingFontSize: number;
  headingFontWeight: number;
  bodyFontSize: number;
  bodyFontWeight: number;
  labelFontSize: number;
  labelFontWeight: number;

  // Container / card
  borderRadius: number;
  shadow: Shadow;
  maxWidth: number;
  padding: number;

  // Inputs
  inputBackgroundColor: string;
  inputBorderColor: string;
  inputBorderRadius: number;

  // Choice controls
  optionGap: number;
  checkedColor: string;

  // Nav footer
  prevLabel: string;
  nextLabel: string;
  submitLabel: string;
  showArrows: boolean;
  buttonBackgroundColor: string;
  buttonTextColor: string;
  buttonHoverColor: string;

  // Progress indicator
  showProgress: boolean;
  progressStyle: ProgressStyle;

  // Submission behavior
  submitWebhookUrl: string;
  submitEmail: string;
  storeSubmissions: boolean;
  honeypotEnabled: boolean;

  // Success / failure screens
  successHeading: string;
  successMessage: string;
  successRedirectUrl: string;
  successRedirectDelay: number;
  errorMessage: string;
}

export interface FormPrivateDeliveryFieldPresence {
  submitWebhookUrl: boolean;
  submitEmail: boolean;
  storeSubmissions: boolean;
}

export function makeFieldId(): string {
  return `f${crypto?.randomUUID ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10)}`;
}

export function makeStepId(): string {
  return `s${crypto?.randomUUID ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10)}`;
}

export function makeOptionId(): string {
  return `o${crypto?.randomUUID ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10)}`;
}

export function defaultFormField(type: FormFieldType = 'text'): FormField {
  const base: FormField = {
    id: makeFieldId(),
    type,
    label: '',
    placeholder: '',
    required: false,
  };
  if (type === 'radio' || type === 'select') {
    base.options = [
      { id: makeOptionId(), label: 'Option 1' },
      { id: makeOptionId(), label: 'Option 2' },
    ];
  } else if (type === 'checkbox-group') {
    base.options = [
      { id: makeOptionId(), label: 'Option 1' },
      { id: makeOptionId(), label: 'Option 2' },
    ];
  }
  return base;
}

export const defaultFormConfig: FormConfig = {
  steps: [
    {
      id: makeStepId(),
      heading: 'WHERE WAS YOUR VEHICLE DAMAGED?',
      description:
        "Select ALL of the areas of your car that need to be repaired.\nIt doesn't have to be exact, just do your best...",
      fields: [
        {
          id: makeFieldId(),
          type: 'checkbox-group',
          label: 'Damage Areas',
          hideLabel: true,
          required: true,
          options: [
            { id: makeOptionId(), label: 'Front' },
            { id: makeOptionId(), label: 'Side' },
            { id: makeOptionId(), label: 'Rear' },
            { id: makeOptionId(), label: 'Wheel(s)' },
            { id: makeOptionId(), label: 'Roof' },
            { id: makeOptionId(), label: 'Underbody' },
            { id: makeOptionId(), label: 'Other' },
          ],
        },
      ],
    },
    {
      id: makeStepId(),
      heading: 'VEHICLE YEAR, MAKE, MODEL',
      description: 'For example: 2023 BMW 740i',
      fields: [
        {
          id: makeFieldId(),
          type: 'text',
          label: 'Vehicle Year, Make, Model',
          hideLabel: true,
          placeholder: 'Type your year, make, model here',
          required: true,
        },
      ],
    },
    {
      id: makeStepId(),
      heading: 'HOW DO YOU PLAN ON PAYING FOR THE REPAIRS?',
      description:
        "If you're going through an insurance company, we can coordinate the repair directly with the insurance provider.\n\nIf you're paying out of pocket, we'll provide an upfront repair estimate based on your vehicle's damage.\n\nChoose the option that best fits your situation, and we'll take care of the rest!",
      fields: [
        {
          id: makeFieldId(),
          type: 'radio',
          label: 'Payment Method',
          hideLabel: true,
          required: true,
          options: [
            { id: makeOptionId(), label: 'My own insurance' },
            { id: makeOptionId(), label: 'Insurance of the person who hit me' },
            { id: makeOptionId(), label: "Out of pocket (you're paying)" },
            { id: makeOptionId(), label: 'Not sure yet (we can guide you)' },
          ],
        },
      ],
    },
    {
      id: makeStepId(),
      heading: 'WHICH INSURANCE COMPANY?',
      description:
        "For example - Allstate, State Farm, AAA, Geico, USAA, etc.\n\n(If you don't know you can skip this step)",
      fields: [
        {
          id: makeFieldId(),
          type: 'text',
          label: 'Insurance Company',
          hideLabel: true,
          placeholder: 'Insurance company name',
          required: false,
        },
      ],
    },
    {
      id: makeStepId(),
      heading: 'THIS IS THE LAST STEP!',
      description:
        "We don't share your info with anyone. Our team will only use it to send your repair estimate with your 30% deductible discount.",
      fields: [
        {
          id: makeFieldId(),
          type: 'text',
          label: 'First and Last Name',
          placeholder: 'John Doe',
          required: true,
        },
        {
          id: makeFieldId(),
          type: 'phone',
          label: 'Your Cell Phone Number',
          placeholder: '(555) 123-4567',
          required: true,
        },
      ],
    },
  ],

  logoUrl: '',
  logoLinkUrl: '',
  logoWidth: 160,
  logoAlignment: 'left',

  fontFamily: 'Poppins',
  primaryColor: '#B01E1E',
  backgroundColor: '#FFFFFF',
  textColor: '#1A1A1A',
  mutedTextColor: '#6B7280',
  errorColor: '#DC2626',
  headingFontSize: 28,
  headingFontWeight: 700,
  bodyFontSize: 16,
  bodyFontWeight: 400,
  labelFontSize: 15,
  labelFontWeight: 600,

  borderRadius: 24,
  shadow: 'soft',
  maxWidth: 560,
  padding: 32,

  inputBackgroundColor: '#F3F4F6',
  inputBorderColor: '#D1D5DB',
  inputBorderRadius: 10,

  optionGap: 16,
  checkedColor: '#B01E1E',

  prevLabel: 'PREV',
  nextLabel: 'NEXT',
  submitLabel: 'SUBMIT',
  showArrows: true,
  buttonBackgroundColor: '#B01E1E',
  buttonTextColor: '#FFFFFF',
  buttonHoverColor: '#8F1818',

  showProgress: false,
  progressStyle: 'bar',

  submitWebhookUrl: '',
  submitEmail: '',
  storeSubmissions: true,
  honeypotEnabled: true,

  successHeading: 'Thank you!',
  successMessage: 'We received your request and will be in touch shortly.',
  successRedirectUrl: '',
  successRedirectDelay: 0,
  errorMessage: 'Something went wrong. Please try again.',
};

// ---------------------------------------------------------------------------
// DB row <-> config mapping
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */

export function formFromDbRow(row: Record<string, any>): FormConfig {
  return {
    steps: Array.isArray(row.steps) ? (row.steps as FormStep[]) : [],

    __privateDeliveryFieldsPresent: {
      submitWebhookUrl: Object.prototype.hasOwnProperty.call(row, 'submit_webhook_url'),
      submitEmail: Object.prototype.hasOwnProperty.call(row, 'submit_email'),
      storeSubmissions: Object.prototype.hasOwnProperty.call(row, 'store_submissions'),
    },

    logoUrl: row.logo_url ?? '',
    logoLinkUrl: row.logo_link_url ?? '',
    logoWidth: row.logo_width ?? 160,
    logoAlignment: row.logo_alignment ?? 'left',

    fontFamily: row.font_family ?? 'Poppins',
    primaryColor: row.primary_color ?? '#B01E1E',
    backgroundColor: row.background_color ?? '#FFFFFF',
    textColor: row.text_color ?? '#1A1A1A',
    mutedTextColor: row.muted_text_color ?? '#6B7280',
    errorColor: row.error_color ?? '#DC2626',
    headingFontSize: row.heading_font_size ?? 28,
    headingFontWeight: row.heading_font_weight ?? 700,
    bodyFontSize: row.body_font_size ?? 16,
    bodyFontWeight: row.body_font_weight ?? 400,
    labelFontSize: row.label_font_size ?? 15,
    labelFontWeight: row.label_font_weight ?? 600,

    borderRadius: row.border_radius ?? 24,
    shadow: row.shadow ?? 'soft',
    maxWidth: row.max_width ?? 560,
    padding: row.padding ?? 32,

    inputBackgroundColor: row.input_background_color ?? '#F3F4F6',
    inputBorderColor: row.input_border_color ?? '#D1D5DB',
    inputBorderRadius: row.input_border_radius ?? 10,

    optionGap: row.option_gap ?? 16,
    checkedColor: row.checked_color ?? '#B01E1E',

    prevLabel: row.prev_label ?? 'PREV',
    nextLabel: row.next_label ?? 'NEXT',
    submitLabel: row.submit_label ?? 'SUBMIT',
    showArrows: row.show_arrows ?? true,
    buttonBackgroundColor: row.button_background_color ?? '#B01E1E',
    buttonTextColor: row.button_text_color ?? '#FFFFFF',
    buttonHoverColor: row.button_hover_color ?? '#8F1818',

    showProgress: row.show_progress ?? false,
    progressStyle: row.progress_style ?? 'bar',

    submitWebhookUrl: row.submit_webhook_url ?? '',
    submitEmail: row.submit_email ?? '',
    storeSubmissions: row.store_submissions ?? true,
    honeypotEnabled: row.honeypot_enabled ?? true,

    successHeading: row.success_heading ?? 'Thank you!',
    successMessage:
      row.success_message ??
      'We received your request and will be in touch shortly.',
    successRedirectUrl: row.success_redirect_url ?? '',
    successRedirectDelay: row.success_redirect_delay ?? 0,
    errorMessage:
      row.error_message ?? 'Something went wrong. Please try again.',
  };
}

export function formToDbRow(config: FormConfig): Record<string, unknown> {
  const row: Record<string, unknown> = {
    steps: config.steps,

    logo_url: config.logoUrl,
    logo_link_url: config.logoLinkUrl,
    logo_width: config.logoWidth,
    logo_alignment: config.logoAlignment,

    font_family: config.fontFamily,
    primary_color: config.primaryColor,
    background_color: config.backgroundColor,
    text_color: config.textColor,
    muted_text_color: config.mutedTextColor,
    error_color: config.errorColor,
    heading_font_size: config.headingFontSize,
    heading_font_weight: config.headingFontWeight,
    body_font_size: config.bodyFontSize,
    body_font_weight: config.bodyFontWeight,
    label_font_size: config.labelFontSize,
    label_font_weight: config.labelFontWeight,

    border_radius: config.borderRadius,
    shadow: config.shadow,
    max_width: config.maxWidth,
    padding: config.padding,

    input_background_color: config.inputBackgroundColor,
    input_border_color: config.inputBorderColor,
    input_border_radius: config.inputBorderRadius,

    option_gap: config.optionGap,
    checked_color: config.checkedColor,

    prev_label: config.prevLabel,
    next_label: config.nextLabel,
    submit_label: config.submitLabel,
    show_arrows: config.showArrows,
    button_background_color: config.buttonBackgroundColor,
    button_text_color: config.buttonTextColor,
    button_hover_color: config.buttonHoverColor,

    show_progress: config.showProgress,
    progress_style: config.progressStyle,

    honeypot_enabled: config.honeypotEnabled,

    success_heading: config.successHeading,
    success_message: config.successMessage,
    success_redirect_url: config.successRedirectUrl,
    success_redirect_delay: config.successRedirectDelay,
    error_message: config.errorMessage,

    updated_at: new Date().toISOString(),
  };

  const privateFields = config.__privateDeliveryFieldsPresent;
  if (!privateFields || privateFields.submitWebhookUrl) {
    row.submit_webhook_url = config.submitWebhookUrl;
  }
  if (!privateFields || privateFields.submitEmail) {
    row.submit_email = config.submitEmail;
  }
  if (!privateFields || privateFields.storeSubmissions) {
    row.store_submissions = config.storeSubmissions;
  }

  return row;
}

/**
 * Stable content fingerprint for the answer contract. It intentionally covers
 * field semantics rather than updated_at, because direct maintenance writes
 * may leave timestamps unchanged. The compact non-cryptographic hash is only
 * a change detector; form submission validation remains authoritative.
 */
export function formSchemaFingerprint(
  rowOrConfig: Record<string, unknown> | FormConfig
): string {
  const rawSteps = rowOrConfig.steps;
  const steps = Array.isArray(rawSteps) ? rawSteps : [];
  const schema = steps.map((step) => {
    const s = (step ?? {}) as Record<string, unknown>;
    const fields = Array.isArray(s.fields) ? s.fields : [];
    return {
      id: s.id ?? '',
      heading: s.heading ?? '',
      description: s.description ?? '',
      footerNote: s.footerNote ?? '',
      visibilityRule: s.visibilityRule ?? null,
      styleOverrides: s.styleOverrides ?? null,
      fields: fields.map((field) => {
        const f = (field ?? {}) as Record<string, unknown>;
        return {
          id: f.id ?? '',
          type: f.type ?? '',
          label: f.label ?? '',
          placeholder: f.placeholder ?? '',
          required: f.required ?? false,
          defaultValue: f.defaultValue ?? null,
          options: f.options ?? [],
          validation: f.validation ?? null,
          visibilityRule: f.visibilityRule ?? null,
          styleOverrides: f.styleOverrides ?? null,
        };
      }),
    };
  });
  const canonicalize = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, nested]) => [key, canonicalize(nested)])
      );
    }
    return value;
  };
  const input = JSON.stringify(canonicalize(schema));
  let first = 0x811c9dc5;
  let second = 0x9e3779b1;
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    first ^= code;
    first = Math.imul(first, 0x01000193);
    second ^= code + index;
    second = Math.imul(second, 0x85ebca6b);
  }
  return `${(first >>> 0).toString(16).padStart(8, '0')}${(
    second >>> 0
  )
    .toString(16)
    .padStart(8, '0')}`;
}

/**
 * Reject answer keys/types/choice values that are not represented by the
 * current server schema. `website` is the one explicit honeypot key allowed
 * outside the configured fields.
 */
export function validateAnswerShape(
  config: FormConfig,
  answers: Record<string, unknown>
): string | null {
  const fields = new Map(config.steps.flatMap((step) => step.fields).map((field) => [field.id, field]));
  for (const [fieldId, value] of Object.entries(answers)) {
    if (fieldId === 'website') continue;
    const field = fields.get(fieldId);
    if (!field) return 'The form changed. Please reload and try again.';

    if (field.type === 'checkbox-group') {
      if (!Array.isArray(value)) {
        return 'The form changed. Please reload and try again.';
      }
      const labels = new Set((field.options ?? []).map((option) => option.label));
      if (value.some((entry) => typeof entry !== 'string' || !labels.has(entry))) {
        return 'The form changed. Please reload and try again.';
      }
      continue;
    }

    if (Array.isArray(value) || (value !== null && typeof value === 'object')) {
      return 'The form changed. Please reload and try again.';
    }

    if ((field.type === 'radio' || field.type === 'select') && value !== '' && value != null) {
      const labels = new Set((field.options ?? []).map((option) => option.label));
      if (typeof value !== 'string' || !labels.has(value)) {
        return 'The form changed. Please reload and try again.';
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Shared field-value helpers (client embed + server submit route)
// ---------------------------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Formats a phone-ish value into `(555) 123-4567` as the user types. */
export function formatPhone(input: string): string {
  const digits = input.replace(/\D/g, '').slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

/** Validates a single field value against its config. Returns an error string or null. */
export function validateFieldValue(
  field: FormField,
  rawValue: unknown
): string | null {
  if (field.type === 'static-text' || field.type === 'hidden') return null;

  const listValue = (v: unknown): unknown[] =>
    Array.isArray(v) ? v : v === undefined || v === null || v === '' ? [] : [v];

  const required = field.validation?.required ?? field.required;
  const isEmpty = (v: unknown) => v === undefined || v === null || v === '';

  if (required) {
    if (field.type === 'checkbox-group') {
      if (listValue(rawValue).length === 0) return 'Please select at least one option';
    } else if (isEmpty(rawValue)) {
      return 'This field is required';
    }
  }

  // For choice fields the required check is enough; individual value checks
  // below only apply to typed inputs.
  switch (field.type) {
    case 'email': {
      const str = rawValue == null ? '' : String(rawValue);
      if (str && !EMAIL_RE.test(str)) return 'Please enter a valid email address';
      break;
    }
    case 'phone': {
      const digits = rawValue == null ? '' : String(rawValue).replace(/\D/g, '');
      if (digits && digits.length < 7) return 'Please enter a valid phone number';
      break;
    }
    case 'text':
    case 'textarea':
    case 'select':
    case 'radio': {
      const str = rawValue == null ? '' : String(rawValue);
      const v = field.validation;
      if (str && v?.minLength != null && str.length < v.minLength) {
        return `Must be at least ${v.minLength} characters`;
      }
      if (v?.maxLength != null && str.length > v.maxLength) {
        return `Must be at most ${v.maxLength} characters`;
      }
      if (str && v?.pattern) {
        try {
          if (!new RegExp(v.pattern).test(str)) return 'Format is not valid';
        } catch {
          // Invalid pattern = ignore on the client; the server still checks.
        }
      }
      break;
    }
    case 'number': {
      const num = rawValue == null ? '' : String(rawValue);
      if (num && Number.isNaN(Number(num))) return 'Please enter a number';
      break;
    }
    case 'checkbox-group': {
      const selected = listValue(rawValue);
      const v = field.validation;
      if (v?.minSelections != null && selected.length < v.minSelections) {
        return `Please select at least ${v.minSelections} option${v.minSelections === 1 ? '' : 's'}`;
      }
      if (v?.maxSelections != null && selected.length > v.maxSelections) {
        return `Please select at most ${v.maxSelections} option${v.maxSelections === 1 ? '' : 's'}`;
      }
      break;
    }
    default:
      break;
  }

  return null;
}

/**
 * Evaluates a visibility rule against the submitted value of the trigger
 * field. `answers` maps fieldId -> value | value[].
 */
export function evaluateVisibilityRule(
  rule: FormVisibilityRule | undefined,
  answers: Record<string, unknown>
): boolean {
  if (!rule) return true;

  const raw = answers[rule.field];
  const list = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];

  switch (rule.operator) {
    case 'equals':
      return list.some((v) => String(v) === rule.value);
    case 'not-equals':
      return !list.some((v) => String(v) === rule.value);
    case 'contains': {
      const needle = rule.value.toLowerCase();
      return list.some((v) => String(v).toLowerCase().includes(needle));
    }
    case 'selected':
      return list.some((v) => String(v) === rule.value || String(v) === 'true');
    default:
      return true;
  }
}

/** Whether a step should show given the collected answers so far. */
export function stepVisible(step: FormStep, answers: Record<string, unknown>): boolean {
  return evaluateVisibilityRule(step.visibilityRule, answers);
}

/** Whether a field should show given the collected answers so far. */
export function fieldVisible(field: FormField, answers: Record<string, unknown>): boolean {
  return evaluateVisibilityRule(field.visibilityRule, answers);
}

/** Resolves the answer value for a field, honoring default values. */
export function fieldAnswer(field: FormField, answers: Record<string, unknown>): unknown {
  const existing = answers[field.id];
  if (existing === undefined && field.defaultValue) return field.defaultValue;
  return existing ?? '';
}

/** Builds a human-readable summary of visible answers (webhook/email payloads). */
export function summarizeAnswers(
  fields: FormField[],
  answers: Record<string, unknown>
): Record<string, { label: string; value: string }> {
  const out: Record<string, { label: string; value: string }> = {};
  for (const field of fields) {
    if (field.type === 'static-text' || field.type === 'hidden' || !fieldVisible(field, answers)) {
      continue;
    }
    const raw = fieldAnswer(field, answers);
    const value = Array.isArray(raw) ? raw.join(', ') : String(raw ?? '');
    if (value) out[field.id] = { label: field.label, value };
  }
  return out;
}
