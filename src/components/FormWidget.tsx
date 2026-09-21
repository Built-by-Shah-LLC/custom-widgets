'use client';

import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import type { FormConfig, FormField, FormStep } from '@/lib/form-config';
import {
  fieldAnswer,
  fieldVisible,
  formatPhone,
  stepVisible,
  validateFieldValue,
} from '@/lib/form-config';
import { resolveFontFamily } from '@/lib/widget-config';

const shadows: Record<string, string> = {
  none: 'none',
  default: '0 4px 12px rgba(0, 0, 0, 0.12)',
  soft: '0 2px 8px rgba(0, 0, 0, 0.08)',
  strong: '0 12px 32px rgba(0, 0, 0, 0.24)',
};

const CHOICE_LABELS: Record<string, string> = {
  text: 'Add text',
  phone: 'Phone',
  email: 'Email',
  textarea: 'Message',
  radio: 'Choose one',
  'checkbox-group': 'Select all that apply',
  select: 'Select an option',
  number: 'Number',
  date: 'Date',
  hidden: 'Hidden value',
  'static-text': 'Text',
};

interface FormWidgetProps {
  config: FormConfig;
  compact?: boolean;
  widgetId?: string;
  apiOrigin?: string;
  /** Server-issued schema fingerprint for open-form stale-schema detection. */
  schemaFingerprint?: string;
}

/**
 * Config-driven multi-step form. Renders inline styles only so it works
 * inside the Shadow DOM embed bundle without Tailwind. Steps and fields are
 * fully driven by `config.steps`; conditional visibility, validation, nav
 * footer, progress, and submit/success/error screens are handled here.
 */
export function FormWidget({
  config,
  compact = false,
  widgetId,
  apiOrigin = '',
  schemaFingerprint,
}: FormWidgetProps) {
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<'form' | 'submitting' | 'success' | 'error'>('form');
  const [errorMsg, setErrorMsg] = useState('');
  const [previewState, setPreviewState] = useState(false);

  const visibleSteps = useMemo(
    () => config.steps.filter((step) => stepVisible(step, answers)),
    [config.steps, answers]
  );

  const [currentIndex, setCurrentIndex] = useState(0);
  const safeIndex = Math.min(currentIndex, Math.max(0, visibleSteps.length - 1));
  const step = visibleSteps[safeIndex];
  const isLast = safeIndex >= visibleSteps.length - 1;

  const visibleFields = (s: FormStep): FormField[] =>
    s.fields.filter((f) => fieldVisible(f, answers));

  const validateStep = (s: FormStep): Record<string, string> => {
    const next: Record<string, string> = {};
    for (const field of visibleFields(s)) {
      const error = validateFieldValue(field, fieldAnswer(field, answers));
      if (error) next[field.id] = error;
    }
    return next;
  };

  const validateAll = (): Record<string, string> => {
    const next: Record<string, string> = {};
    for (const s of visibleSteps) {
      for (const field of visibleFields(s)) {
        const error = validateFieldValue(field, fieldAnswer(field, answers));
        if (error) next[field.id] = error;
      }
    }
    return next;
  };

  const setValue = (fieldId: string, value: unknown) => {
    setAnswers((a) => ({ ...a, [fieldId]: value }));
    setErrors((e) => {
      if (!e[fieldId]) return e;
      const { [fieldId]: _dropped, ...rest } = e;
      return rest;
    });
  };

  const goNext = () => {
    const stepErrors = validateStep(step);
    if (Object.keys(stepErrors).length > 0) {
      setErrors(stepErrors);
      return;
    }
    if (isLast) {
      void submit();
      return;
    }
    setErrors({});
    setCurrentIndex((i) => Math.min(i + 1, visibleSteps.length - 1));
  };

  const goPrev = () => {
    setErrors({});
    setCurrentIndex((i) => Math.max(i - 1, 0));
  };

  const submit = async () => {
    const allErrors = validateAll();
    if (Object.keys(allErrors).length > 0) {
      // Jump back to the first offending step.
      const stepWithError = visibleSteps.findIndex((s) =>
        visibleFields(s).some((f) => allErrors[f.id])
      );
      setErrors(allErrors);
      if (stepWithError >= 0) setCurrentIndex(stepWithError);
      return;
    }

    // Honeypot: humans can't see/fill this field; filled = bot, pretend success.
    const honeypot = String(answers['website'] ?? '');

    if (!widgetId) {
      setPreviewState(true);
      setStatus('success');
      return;
    }

    setStatus('submitting');
    setErrorMsg('');
    try {
      const res = await fetch(
        `${apiOrigin}/api/forms/${widgetId}/submit`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            answers,
            ...(schemaFingerprint ? { schemaFingerprint } : {}),
            meta: {
              honeypot,
              referrer: document.referrer || '',
              userAgent: navigator.userAgent || '',
            },
          }),
        }
      );
      if (!res.ok) {
        const responseBody = (await res.json().catch(() => null)) as
          | { error?: string; message?: string }
          | null;
        if (
          responseBody?.error === 'FORM_SCHEMA_CHANGED' ||
          responseBody?.message?.toLowerCase().includes('form changed')
        ) {
          throw new Error(
            responseBody.message ||
              'This form changed while it was open. Please reload and try again.'
          );
        }
        throw new Error(`HTTP ${res.status}`);
      }
      setStatus('success');
    } catch (err) {
      console.warn(`[custom-widgets] Submit failed for ${widgetId}:`, err);
      setStatus('error');
      setErrorMsg(
        err instanceof Error && err.message.includes('form changed')
          ? err.message
          : config.errorMessage || 'Something went wrong. Please try again.'
      );
    }
  };

  const retry = () => {
    setStatus('form');
    setErrorMsg('');
  };

  // Auto-redirect after success (0 delay or empty URL = stay on the screen).
  useEffect(() => {
    if (status !== 'success' || !config.successRedirectUrl || config.successRedirectDelay <= 0) {
      return;
    }
    const timer = window.setTimeout(() => {
      window.location.href = config.successRedirectUrl;
    }, config.successRedirectDelay * 1000);
    return () => window.clearTimeout(timer);
  }, [status, config.successRedirectUrl, config.successRedirectDelay]);

  if (status === 'success') {
    return (
      <div data-bbs-widget="form" data-bbs-success style={cardStyle(config)}>
        <div style={{ padding: config.padding, textAlign: 'center' }}>
          <div
            style={{
              width: 56,
              height: 56,
              margin: '0 auto 16px',
              borderRadius: '9999px',
              background: config.checkedColor,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="3">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </div>
          <h2
            style={{
              margin: 0,
              fontFamily: resolveFontFamily(config.fontFamily),
              color: config.textColor,
              fontSize: `${config.headingFontSize}px`,
              fontWeight: config.headingFontWeight,
            }}
          >
            {config.successHeading}
          </h2>
          <p
            style={{
              margin: '12px 0 0',
              fontFamily: resolveFontFamily(config.fontFamily),
              color: config.mutedTextColor,
              fontSize: `${config.bodyFontSize}px`,
              lineHeight: 1.6,
            }}
          >
            {config.successMessage}
          </p>
        </div>
      </div>
    );
  }

  if (status === 'error' && !previewState) {
    return (
      <div data-bbs-widget="form" data-bbs-error style={cardStyle(config)}>
        <div style={{ padding: config.padding, textAlign: 'center' }}>
          <p
            style={{
              margin: '0 0 16px',
              fontFamily: resolveFontFamily(config.fontFamily),
              color: config.errorColor,
              fontSize: `${config.bodyFontSize}px`,
            }}
          >
            {errorMsg}
          </p>
          <button
            type="button"
            data-bbs-prev
            onClick={retry}
            style={{
              ...buttonStyle(
                config.buttonBackgroundColor,
                config.buttonTextColor,
                config.buttonHoverColor
              ),
              padding: '12px 24px',
            }}
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!step) {
    return <div data-bbs-widget="form" style={cardStyle(config)} />;
  }

  const fields = visibleFields(step);
  const inputStyle = (field: FormField): CSSProperties => ({
    width: '100%',
    boxSizing: 'border-box',
    padding: '12px 14px',
    fontFamily: resolveFontFamily(config.fontFamily),
    fontSize: `${config.bodyFontSize}px`,
    color: config.textColor,
    fontWeight: config.bodyFontWeight as CSSProperties['fontWeight'],
    background: config.inputBackgroundColor,
    border: `1px solid ${config.inputBorderColor}`,
    borderRadius: `${config.inputBorderRadius}px`,
    outline: 'none',
    transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
  });

  const labelStyle: CSSProperties = {
    display: 'block',
    marginBottom: 6,
    fontFamily: resolveFontFamily(config.fontFamily),
    fontSize: `${config.labelFontSize}px`,
    fontWeight: config.labelFontWeight as CSSProperties['fontWeight'],
    color: config.textColor,
  };

  const renderField = (field: FormField): React.ReactNode => {
    const value = fieldAnswer(field, answers) as string;
    const error = errors[field.id];
    const inputId = `fld_${field.id}`;
    const sharedInput = {
      id: inputId,
      'data-bbs-field': field.id,
      'aria-invalid': error ? true : undefined,
      style: {
        ...inputStyle(field),
        ...(error ? { borderColor: config.errorColor } : {}),
        ...(field.styleOverrides ?? {}),
      } as CSSProperties,
      onFocus: (e: React.FocusEvent<HTMLElement>) => {
        e.currentTarget.style.borderColor = config.checkedColor;
        e.currentTarget.style.boxShadow = `0 0 0 3px ${config.checkedColor}33`;
      },
      onBlur: (e: React.FocusEvent<HTMLElement>) => {
        e.currentTarget.style.borderColor = error
          ? config.errorColor
          : config.inputBorderColor;
        e.currentTarget.style.boxShadow = 'none';
      },
    };

    switch (field.type) {
      case 'static-text': {
        return (
          <div>
            {field.label ? (
              <p
                style={{
                  margin: 0,
                  fontFamily: resolveFontFamily(config.fontFamily),
                  color: config.textColor,
                  fontSize: `${config.bodyFontSize}px`,
                  fontWeight: config.bodyFontWeight as CSSProperties['fontWeight'],
                  lineHeight: 1.6,
                }}
              >
                {field.label}
              </p>
            ) : null}
          </div>
        );
      }
      case 'hidden': {
        return (
          <input
            type="hidden"
            data-bbs-field={field.id}
            value={(field.defaultValue ?? field.placeholder ?? '') as string}
          />
        );
      }
      case 'textarea': {
        return (
          <>
            <textarea
              {...sharedInput}
              value={value ?? ''}
              rows={4}
              placeholder={field.placeholder}
              onChange={(e) => setValue(field.id, e.target.value)}
            />
            {error && <ErrorText config={config} message={error} />}
          </>
        );
      }
      case 'select': {
        return (
          <>
            <select
              {...sharedInput}
              value={value ?? ''}
              onChange={(e) => setValue(field.id, e.target.value)}
            >
              <option value="">{field.placeholder || CHOICE_LABELS.select}</option>
              {(field.options ?? []).map((opt) => (
                <option key={opt.id} value={opt.label}>
                  {opt.label}
                </option>
              ))}
            </select>
            {error && <ErrorText config={config} message={error} />}
          </>
        );
      }
      case 'radio': {
        return (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: config.optionGap }}>
              {(field.options ?? []).map((opt) => {
                const checked = value === opt.label;
                return (
                  <label
                    key={opt.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      cursor: 'pointer',
                      fontFamily: resolveFontFamily(config.fontFamily),
                      fontSize: `${config.bodyFontSize}px`,
                      color: config.textColor,
                    }}
                  >
                    <input
                      type="radio"
                      name={field.id}
                      value={opt.label}
                      checked={checked}
                      data-bbs-field={field.id}
                      onChange={() => setValue(field.id, opt.label)}
                      style={{
                        width: 18,
                        height: 18,
                        accentColor: config.checkedColor,
                        cursor: 'pointer',
                      }}
                    />
                    {opt.label}
                  </label>
                );
              })}
            </div>
            {error && <ErrorText config={config} message={error} />}
          </>
        );
      }
      case 'checkbox-group': {
        const selected = (Array.isArray(answers[field.id]) ? answers[field.id] : []) as string[];
        return (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: config.optionGap }}>
              {(field.options ?? []).map((opt) => {
                const checked = selected.includes(opt.label);
                return (
                  <label
                    key={opt.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      cursor: 'pointer',
                      fontFamily: resolveFontFamily(config.fontFamily),
                      fontSize: `${config.bodyFontSize}px`,
                      color: config.textColor,
                    }}
                  >
                    <input
                      type="checkbox"
                      value={opt.label}
                      checked={checked}
                      data-bbs-field={field.id}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? [...selected, opt.label]
                          : selected.filter((v) => v !== opt.label);
                        setValue(field.id, next);
                      }}
                      style={{
                        width: 18,
                        height: 18,
                        accentColor: config.checkedColor,
                        cursor: 'pointer',
                      }}
                    />
                    {opt.label}
                  </label>
                );
              })}
            </div>
            {error && <ErrorText config={config} message={error} />}
          </>
        );
      }
      case 'phone': {
        return (
          <>
            <input
              {...sharedInput}
              type="tel"
              value={value ?? ''}
              inputMode="tel"
              autoComplete="tel"
              placeholder={field.placeholder}
              onChange={(e) => setValue(field.id, formatPhone(e.target.value))}
            />
            {error && <ErrorText config={config} message={error} />}
          </>
        );
      }
      case 'email': {
        return (
          <>
            <input
              {...sharedInput}
              type="email"
              value={value ?? ''}
              autoComplete="email"
              placeholder={field.placeholder}
              onChange={(e) => setValue(field.id, e.target.value)}
            />
            {error && <ErrorText config={config} message={error} />}
          </>
        );
      }
      case 'number': {
        return (
          <>
            <input
              {...sharedInput}
              type="number"
              value={value ?? ''}
              inputMode="numeric"
              placeholder={field.placeholder}
              onChange={(e) => setValue(field.id, e.target.value)}
            />
            {error && <ErrorText config={config} message={error} />}
          </>
        );
      }
      case 'date': {
        return (
          <>
            <input
              {...sharedInput}
              type="date"
              value={value ?? ''}
              onChange={(e) => setValue(field.id, e.target.value)}
            />
            {error && <ErrorText config={config} message={error} />}
          </>
        );
      }
      case 'text':
      default: {
        return (
          <>
            <input
              {...sharedInput}
              type="text"
              value={value ?? ''}
              placeholder={field.placeholder}
              onChange={(e) => setValue(field.id, e.target.value)}
            />
            {error && <ErrorText config={config} message={error} />}
          </>
        );
      }
    }
  };

  const stepStyleOverrides = step.styleOverrides ?? {};
  const headingStyle: CSSProperties = {
    margin: 0,
    fontFamily: resolveFontFamily((stepStyleOverrides.fontFamily as string) ?? config.fontFamily),
    fontSize: `${((stepStyleOverrides.headingFontSize as number) ?? config.headingFontSize)}px`,
    fontWeight:
      ((stepStyleOverrides.headingFontWeight as number) ?? config.headingFontWeight) as CSSProperties['fontWeight'],
    color: (stepStyleOverrides.color as string) ?? config.textColor,
    textAlign: (stepStyleOverrides.textAlign as CSSProperties['textAlign']) ?? 'left',
    textTransform: (stepStyleOverrides.textTransform as string) ?? 'none',
    lineHeight: 1.2,
  };

  const progressText = `${safeIndex + 1} of ${visibleSteps.length}`;

  return (
    <div data-bbs-widget="form" style={cardStyle(config)}>
      <div style={{ padding: config.padding }}>
        {/* Logo */}
        {config.logoUrl && (
          <div
            style={{
              display: 'flex',
              justifyContent:
                config.logoAlignment === 'center'
                  ? 'center'
                  : config.logoAlignment === 'right'
                    ? 'flex-end'
                    : 'flex-start',
              marginBottom: 20,
            }}
          >
            {config.logoLinkUrl ? (
              <a href={config.logoLinkUrl} target="_blank" rel="noreferrer noopener">
                <img
                  src={config.logoUrl}
                  alt=""
                  style={{ width: config.logoWidth, maxWidth: '100%', height: 'auto', display: 'block' }}
                />
              </a>
            ) : (
              <img
                src={config.logoUrl}
                alt=""
                style={{ width: config.logoWidth, maxWidth: '100%', height: 'auto', display: 'block' }}
              />
            )}
          </div>
        )}

        {/* Step heading */}
        <h2 style={headingStyle}>{step.heading}</h2>

        {/* Description (multi-paragraph) */}
        {step.description ? (
          <div style={{ marginTop: 12 }}>
            {step.description.split(/\n+/).map((para, i) => (
              <p
                key={i}
                style={{
                  margin: i > 0 ? '8px 0 0' : 0,
                  fontFamily: resolveFontFamily(config.fontFamily),
                  fontSize: `${config.bodyFontSize}px`,
                  color: config.mutedTextColor,
                  lineHeight: 1.6,
                }}
              >
                {para}
              </p>
            ))}
          </div>
        ) : null}

        {/* Fields */}
        <div style={{ marginTop: 24 }}>
          {fields.map((field) => (
            <div key={field.id} style={{ marginBottom: 18 }}>
              {field.type !== 'static-text' && field.label && !field.hideLabel ? (
                <label htmlFor={`fld_${field.id}`} style={labelStyle}>
                  {field.label}
                  {field.validation?.required ?? field.required ? (
                    <span aria-hidden="true" style={{ color: config.errorColor }}>
                      {' '}
                      *
                    </span>
                  ) : null}
                </label>
              ) : null}
              {renderField(field)}
            </div>
          ))}

          {/* Honeypot (invisible to humans) */}
          {config.honeypotEnabled && (
            <div
              aria-hidden="true"
              style={{ position: 'absolute', left: -9999, top: -9999, height: 0, overflow: 'hidden' }}
            >
              <label>
                Website
                <input
                  type="text"
                  name="website"
                  tabIndex={-1}
                  autoComplete="off"
                  data-bbs-honeypot
                  value={String(answers['website'] ?? '')}
                  onChange={(e) => setValue('website', e.target.value)}
                />
              </label>
            </div>
          )}
        </div>

        {/* Progress */}
        {config.showProgress && visibleSteps.length > 1 && (
          <div style={{ marginTop: 20 }}>
            {config.progressStyle === 'steps' ? (
              <div
                style={{
                  textAlign: 'center',
                  fontFamily: resolveFontFamily(config.fontFamily),
                  fontSize: 13,
                  color: config.mutedTextColor,
                }}
              >
                Step {progressText}
              </div>
            ) : (
              <div
                style={{
                  height: 6,
                  borderRadius: 9999,
                  background: config.inputBackgroundColor,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${((safeIndex + 1) / visibleSteps.length) * 100}%`,
                    background: config.checkedColor,
                    borderRadius: 9999,
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>
            )}
          </div>
        )}

        {/* Footer note */}
        {step.footerNote ? (
          <p
            style={{
              margin: '20px 0 0',
              fontFamily: resolveFontFamily(config.fontFamily),
              fontSize: 12,
              color: config.mutedTextColor,
              textAlign: 'center',
            }}
          >
            {step.footerNote}
          </p>
        ) : null}
      </div>

      {/* Nav footer */}
      <div
        style={{
          display: 'flex',
          borderTop: `1px solid ${config.inputBorderColor}`,
          borderBottomLeftRadius: `${config.borderRadius}px`,
          borderBottomRightRadius: `${config.borderRadius}px`,
          overflow: 'hidden',
        }}
      >
        {safeIndex > 0 && (
          <button
            type="button"
            data-bbs-prev
            onClick={goPrev}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: compact ? '12px' : '16px',
              fontFamily: resolveFontFamily(config.fontFamily),
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: '0.05em',
              background: config.buttonBackgroundColor,
              color: config.buttonTextColor,
              border: 'none',
              cursor: 'pointer',
              transition: 'background 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = config.buttonHoverColor)}
            onMouseLeave={(e) => (e.currentTarget.style.background = config.buttonBackgroundColor)}
          >
            {config.showArrows && (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            )}
            {config.prevLabel}
          </button>
        )}
        <button
          type="button"
          data-bbs-next={isLast ? undefined : 'true'}
          data-bbs-submit={isLast ? 'true' : undefined}
          onClick={goNext}
          disabled={status === 'submitting'}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            padding: compact ? '12px' : '16px',
            fontFamily: resolveFontFamily(config.fontFamily),
            fontSize: 14,
            fontWeight: 700,
            letterSpacing: '0.05em',
            background: config.buttonBackgroundColor,
            color: config.buttonTextColor,
            border: 'none',
            cursor: status === 'submitting' ? 'wait' : 'pointer',
            opacity: status === 'submitting' ? 0.7 : 1,
            transition: 'background 0.15s ease',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = config.buttonHoverColor)}
          onMouseLeave={(e) => (e.currentTarget.style.background = config.buttonBackgroundColor)}
        >
          {status === 'submitting'
            ? 'Submitting…'
            : isLast
              ? config.submitLabel
              : config.nextLabel}
          {config.showArrows && !isLast && (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <path d="M9 18l6-6-6-6" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}

function ErrorText({ config, message }: { config: FormConfig; message: string }) {
  return (
    <p
      role="alert"
      style={{
        margin: '6px 0 0',
        fontFamily: resolveFontFamily(config.fontFamily),
        fontSize: 13,
        color: config.errorColor,
      }}
    >
      {message}
    </p>
  );
}

function buttonStyle(
  background: string,
  color: string,
  hover: string
): CSSProperties {
  return {
    background,
    color,
    fontFamily: 'inherit',
    fontSize: 14,
    fontWeight: 700,
    letterSpacing: '0.05em',
    border: 'none',
    borderRadius: 10,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    transition: 'background 0.15s ease',
  };
}

function cardStyle(config: FormConfig): CSSProperties {
  return {
    width: '100%',
    maxWidth: `${config.maxWidth}px`,
    margin: '0 auto',
    boxSizing: 'border-box',
    background: config.backgroundColor,
    borderRadius: `${config.borderRadius}px`,
    boxShadow: shadows[config.shadow],
    overflow: 'hidden',
    position: 'relative',
  };
}
