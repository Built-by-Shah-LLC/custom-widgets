'use client';

import { useRef, useState } from 'react';
import type { FormConfig, FormField, FormFieldType, VisibilityOperator } from '@/lib/form-config';
import type { FormStep } from '@/lib/form-config';
import type { FormStepsApi } from './FormEditor';
import {
  Card,
  ColorField,
  Field,
  NumberInput,
  Section,
  Select,
  Slider,
  TextInput,
  Toggle,
} from './controls';

export interface FormEditorTabProps {
  config: FormConfig;
  update: <K extends keyof FormConfig>(key: K, value: FormConfig[K]) => void;
  stepsApi: FormStepsApi;
  widgetName: string;
  onNameChange: (name: string) => void;
}

const FIELD_TYPES: { value: FormFieldType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'phone', label: 'Phone' },
  { value: 'email', label: 'Email' },
  { value: 'textarea', label: 'Textarea' },
  { value: 'radio', label: 'Radio (single choice)' },
  { value: 'checkbox-group', label: 'Checkboxes (multi choice)' },
  { value: 'select', label: 'Dropdown' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'hidden', label: 'Hidden value' },
  { value: 'static-text', label: 'Static text' },
];

const OPERATORS: { value: string; label: string }[] = [
  { value: 'equals', label: 'equals' },
  { value: 'not-equals', label: 'does not equal' },
  { value: 'contains', label: 'contains' },
  { value: 'selected', label: 'is selected' },
];

function TextArea({
  value,
  onChange,
  placeholder,
  rows = 2,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
      value={value ?? ''}
      rows={rows}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="ui-control w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm text-[var(--color-text-primary)] transition-[border-color,box-shadow] focus:border-[var(--color-accent)] focus:shadow-[var(--shadow-glow)]"
    />
  );
}

function MoveButtons({
  canUp,
  canDown,
  onUp,
  onDown,
  onDelete,
  label,
}: {
  canUp: boolean;
  canDown: boolean;
  onUp: () => void;
  onDown: () => void;
  onDelete: () => void;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={onUp}
        disabled={!canUp}
        title={`Move ${label} up`}
        className="ui-control flex h-6 w-6 items-center justify-center rounded-md text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] disabled:opacity-30"
      >
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path d="M18 15l-6-6-6 6" />
        </svg>
      </button>
      <button
        type="button"
        onClick={onDown}
        disabled={!canDown}
        title={`Move ${label} down`}
        className="ui-control flex h-6 w-6 items-center justify-center rounded-md text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] disabled:opacity-30"
      >
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      <button
        type="button"
        onClick={onDelete}
        title={`Delete ${label}`}
        className="ui-control flex h-6 w-6 items-center justify-center rounded-md text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-danger)] hover:text-white"
      >
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6" />
        </svg>
      </button>
    </div>
  );
}

function VisibilityEditor({
  fields,
  rule,
  onChange,
}: {
  fields: { id: string; label: string }[];
  rule: FormField['visibilityRule'];
  onChange: (rule: FormField['visibilityRule']) => void;
}) {
  const [enabled, setEnabled] = useState(Boolean(rule));
  if (!enabled) {
    return (
      <Toggle
        checked={false}
        onChange={(v) => {
          setEnabled(v);
          if (v) {
            const first = fields[0];
            onChange(first ? { field: first.id, operator: 'equals', value: '' } : undefined);
          } else {
            onChange(undefined);
          }
        }}
        label="Show conditionally"
        description="Only show when a previous field matches"
      />
    );
  }
  const current = rule ?? { field: fields[0]?.id ?? '', operator: 'equals' as const, value: '' };
  return (
    <div className="mb-3 rounded-lg bg-[var(--color-bg-secondary)] p-3">
      <Toggle
        checked={true}
        onChange={(v) => {
          setEnabled(v);
          if (!v) onChange(undefined);
        }}
        label="Show conditionally"
      />
      <div className="mt-3 grid grid-cols-1 gap-3">
        {fields.length === 0 ? (
          <p className="text-xs text-[var(--color-text-muted)]">
            No fields available to build a condition on.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Field label="When field">
                <Select
                  value={current.field}
                  onChange={(v) => onChange({ ...current, field: v })}
                  options={fields.map((f) => ({ value: f.id, label: f.label || f.id.slice(0, 8) }))}
                />
              </Field>
              <Field label="Operator">
                <Select
                  value={current.operator}
                  onChange={(v) =>
                    onChange({ ...current, operator: v as VisibilityOperator })
                  }
                  options={OPERATORS}
                />
              </Field>
            </div>
            <Field label="Value">
              <TextInput
                value={current.value}
                onChange={(v) => onChange({ ...current, value: v })}
                placeholder="e.g. Insurance"
              />
            </Field>
          </>
        )}
      </div>
    </div>
  );
}

function OptionsEditor({
  stepId,
  field,
  api,
}: {
  stepId: string;
  field: FormField;
  api: FormStepsApi;
}) {
  const options = field.options ?? [];
  return (
    <div className="mt-3">
      <div className="mb-2 text-xs font-medium text-[var(--color-text-secondary)]">Options</div>
      {options.map((opt, i) => (
        <div key={opt.id} className="mb-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => api.moveOption(stepId, field.id, opt.id, -1)}
            disabled={i === 0}
            className="ui-control flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] disabled:opacity-30"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M18 15l-6-6-6 6" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => api.moveOption(stepId, field.id, opt.id, 1)}
            disabled={i === options.length - 1}
            className="ui-control flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] disabled:opacity-30"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
          <TextInput
            value={opt.label}
            onChange={(v) => api.updateOption(stepId, field.id, opt.id, v)}
            placeholder="Option label"
          />
          <button
            type="button"
            onClick={() => api.removeOption(stepId, field.id, opt.id)}
            title="Remove option"
            className="ui-control flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-[var(--color-text-secondary)] hover:bg-[var(--color-danger)] hover:text-white"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => api.addOption(stepId, field.id)}
        className="ui-control flex items-center gap-1.5 rounded-lg border border-dashed border-[var(--color-border)] px-3 py-2 text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-hover)]"
      >
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
          <path d="M12 5v14M5 12h14" />
        </svg>
        Add option
      </button>
    </div>
  );
}

function FieldEditor({
  stepId,
  field,
  index,
  total,
  fields,
  api,
}: {
  stepId: string;
  field: FormField;
  index: number;
  total: number;
  fields: { id: string; label: string }[];
  api: FormStepsApi;
}) {
  const isChoice = ['radio', 'checkbox-group', 'select'].includes(field.type);
  const isStaticOrHidden = field.type === 'static-text' || field.type === 'hidden';
  const isCheckbox = field.type === 'checkbox-group';
  const v = field.validation ?? {};

  return (
    <div className="mb-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-3">
      <div className="mb-2 flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <Select
            value={field.type}
            onChange={(val) => api.updateField(stepId, field.id, { type: val as FormFieldType })}
            options={FIELD_TYPES.map((t) => ({ value: t.value, label: t.label }))}
          />
        </div>
        <MoveButtons
          label="field"
          canUp={index > 0}
          canDown={index < total - 1}
          onUp={() => api.moveField(stepId, field.id, -1)}
          onDown={() => api.moveField(stepId, field.id, 1)}
          onDelete={() => api.removeField(stepId, field.id)}
        />
      </div>

      <Field label="Label">
        <TextInput
          value={field.label}
          onChange={(val) => api.updateField(stepId, field.id, { label: val })}
          placeholder="Field label"
        />
      </Field>

      {!isStaticOrHidden && (
        <>
          {!isChoice && (
            <Field label="Placeholder">
              <TextInput
                value={field.placeholder ?? ''}
                onChange={(val) => api.updateField(stepId, field.id, { placeholder: val })}
                placeholder="Placeholder text"
              />
            </Field>
          )}
          <div className="grid grid-cols-2 gap-4">
            {!isChoice && field.type !== 'number' && field.type !== 'date' && (
              <Field label="Default value">
                <TextInput
                  value={field.defaultValue ?? ''}
                  onChange={(val) => api.updateField(stepId, field.id, { defaultValue: val })}
                />
              </Field>
            )}
            <Field label="Required">
              <div className="pt-2">
                <input
                  type="checkbox"
                  checked={field.required}
                  onChange={(e) => api.updateField(stepId, field.id, { required: e.target.checked })}
                  className="h-4 w-4 accent-[var(--color-accent)]"
                />
              </div>
            </Field>
          </div>
        </>
      )}

      {isChoice && <OptionsEditor stepId={stepId} field={field} api={api} />}

      {field.type === 'checkbox-group' && (
        <div className="mt-3 grid grid-cols-2 gap-4">
          <Field label="Min selections">
            <NumberInput
              value={v.minSelections ?? 0}
              min={0}
              onChange={(val) => api.updateField(stepId, field.id, { validation: { ...v, minSelections: val } })}
            />
          </Field>
          <Field label="Max selections">
            <NumberInput
              value={v.maxSelections ?? 0}
              min={0}
              onChange={(val) => api.updateField(stepId, field.id, { validation: { ...v, maxSelections: val } })}
            />
          </Field>
        </div>
      )}

      {!isCheckbox && !isStaticOrHidden && field.type !== 'number' && field.type !== 'date' && (
        <div className="mt-3 grid grid-cols-2 gap-4">
          <Field label="Min length">
            <NumberInput
              value={v.minLength ?? 0}
              min={0}
              onChange={(val) => api.updateField(stepId, field.id, { validation: { ...v, minLength: val } })}
            />
          </Field>
          <Field label="Max length">
            <NumberInput
              value={v.maxLength ?? 0}
              min={0}
              onChange={(val) => api.updateField(stepId, field.id, { validation: { ...v, maxLength: val } })}
            />
          </Field>
        </div>
      )}

      {!isCheckbox && !isStaticOrHidden && (
        <div className="mt-3">
          <Field label="Regex pattern (optional)">
            <TextInput
              value={v.pattern ?? ''}
              onChange={(val) =>
                api.updateField(stepId, field.id, {
                  validation: { ...v, pattern: val || undefined },
                })
              }
              placeholder="e.g. ^[A-Z]{2}$"
            />
          </Field>
        </div>
      )}

      <div className="mt-3">
        <VisibilityEditor
          fields={fields}
          rule={field.visibilityRule}
          onChange={(rule) => api.updateField(stepId, field.id, { visibilityRule: rule })}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Content tab
// ---------------------------------------------------------------------------

function ImageField({
  label,
  url,
  onChange,
}: {
  label: string;
  url: string;
  onChange: (v: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/v1/uploads', { method: 'POST', body: form });
      if (!res.ok) throw new Error(await res.text());
      const { url: publicUrl } = await res.json();
      onChange(publicUrl);
    } catch (err) {
      alert(`Upload failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <Field label={label}>
      <div className="mb-2 flex h-24 items-center justify-center overflow-hidden rounded-lg bg-[var(--color-bg-secondary)]">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={label} className="h-full w-full object-contain" />
        ) : (
          <span className="text-xs text-[var(--color-text-muted)]">No logo set</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload(file);
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="ui-control flex flex-shrink-0 items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2.5 text-sm text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-bg-hover)] disabled:opacity-50"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
          </svg>
          {uploading ? 'Uploading…' : 'Upload'}
        </button>
        <div className="min-w-0 flex-1">
          <TextInput value={url} onChange={onChange} placeholder="https://… logo URL" />
        </div>
      </div>
    </Field>
  );
}

export function ContentTab({ config, update, widgetName, onNameChange }: FormEditorTabProps) {
  return (
    <>
      <Section title="Name">
        <Card>
          <TextInput value={widgetName} onChange={onNameChange} placeholder="Widget name" />
        </Card>
      </Section>

      <Section title="Logo">
        <Card>
          <ImageField label="Logo" url={config.logoUrl} onChange={(v) => update('logoUrl', v)} />
          <div className="mt-4">
            <Field label="Link (optional)">
              <TextInput
                value={config.logoLinkUrl}
                onChange={(v) => update('logoLinkUrl', v)}
                placeholder="https://… homepage"
              />
            </Field>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <Field label="Width (px)">
              <NumberInput value={config.logoWidth} min={40} onChange={(v) => update('logoWidth', v)} />
            </Field>
            <Field label="Alignment">
              <Select
                value={config.logoAlignment}
                onChange={(v) => update('logoAlignment', v as FormConfig['logoAlignment'])}
                options={[
                  { value: 'left', label: 'Left' },
                  { value: 'center', label: 'Center' },
                  { value: 'right', label: 'Right' },
                ]}
              />
            </Field>
          </div>
        </Card>
      </Section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Steps tab
// ---------------------------------------------------------------------------

export function StepsTab({ config, stepsApi: api }: FormEditorTabProps) {
  const allFields = config.steps.flatMap((s) =>
    s.fields.map((f) => ({ id: f.id, label: f.label || `(${f.type})` }))
  );

  const addField = (step: FormStep, type: FormFieldType) => api.addField(step.id, type);

  return (
    <div>
      <button
        type="button"
        onClick={api.addStep}
        className="ui-control mb-4 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-3 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-hover)]"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
          <path d="M12 5v14M5 12h14" />
        </svg>
        Add Step
      </button>

      {config.steps.map((step, stepIndex) => (
        <div
          key={step.id}
          className="mb-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-4"
        >
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[var(--color-bg-secondary)] text-xs font-bold text-[var(--color-text-secondary)] ring-1 ring-[var(--color-border)]">
              {stepIndex + 1}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--color-text-primary)]">
              {step.heading || 'Untitled step'}
            </span>
            <MoveButtons
              label="step"
              canUp={stepIndex > 0}
              canDown={stepIndex < config.steps.length - 1}
              onUp={() => api.moveStep(step.id, -1)}
              onDown={() => api.moveStep(step.id, 1)}
              onDelete={() => api.removeStep(step.id)}
            />
          </div>

          <Field label="Heading">
            <TextInput
              value={step.heading}
              onChange={(v) => api.updateStep(step.id, { heading: v })}
              placeholder="Step heading"
            />
          </Field>

          <div className="mt-3">
            <Field label="Description (blank line = new paragraph)">
              <TextArea
                value={step.description ?? ''}
                onChange={(v) => api.updateStep(step.id, { description: v })}
                rows={3}
              />
            </Field>
          </div>

          <div className="mt-3">
            <Field label="Footer note (optional)">
              <TextInput
                value={step.footerNote ?? ''}
                onChange={(v) => api.updateStep(step.id, { footerNote: v })}
                placeholder="e.g. We don't share your information."
              />
            </Field>
          </div>

          <div className="mt-3">
            <VisibilityEditor
              fields={allFields.filter((f) => !step.fields.some((sf) => sf.id === f.id))}
              rule={step.visibilityRule}
              onChange={(rule) => api.updateStep(step.id, { visibilityRule: rule })}
            />
          </div>

          <div className="mt-4 border-t border-[var(--color-border)] pt-3">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-semibold tracking-wide text-[var(--color-text-secondary)] uppercase">
                Fields ({step.fields.length})
              </span>
              <button
                type="button"
                onClick={() => addField(step, 'text')}
                className="ui-control flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-hover)]"
              >
                <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Add Field
              </button>
            </div>

            {step.fields.map((field, fieldIndex) => (
              <FieldEditor
                key={field.id}
                stepId={step.id}
                field={field}
                index={fieldIndex}
                total={step.fields.length}
                fields={allFields.filter((f) => f.id !== field.id)}
                api={api}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Style tab
// ---------------------------------------------------------------------------

const FONT_OPTIONS = [
  { value: 'inherit', label: 'Inherit from Website' },
  { value: 'system-ui', label: 'System Default' },
  { value: 'Poppins', label: 'Poppins' },
  { value: 'Inter', label: 'Inter' },
  { value: 'Roboto', label: 'Roboto' },
  { value: 'Open Sans', label: 'Open Sans' },
  { value: 'Lato', label: 'Lato' },
  { value: 'Montserrat', label: 'Montserrat' },
  { value: 'Arial', label: 'Arial' },
];

export function StyleTab({ config, update }: FormEditorTabProps) {
  return (
    <>
      <Section title="Typography">
        <Card>
          <Field label="Font Family">
            <Select value={config.fontFamily} onChange={(v) => update('fontFamily', v)} options={FONT_OPTIONS} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Heading Size">
              <NumberInput value={config.headingFontSize} min={12} max={64} onChange={(v) => update('headingFontSize', v)} />
            </Field>
            <Field label="Heading Weight">
              <NumberInput value={config.headingFontWeight} min={100} max={900} onChange={(v) => update('headingFontWeight', v)} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Body Size">
              <NumberInput value={config.bodyFontSize} min={12} max={32} onChange={(v) => update('bodyFontSize', v)} />
            </Field>
            <Field label="Label Size">
              <NumberInput value={config.labelFontSize} min={10} max={32} onChange={(v) => update('labelFontSize', v)} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Label Weight">
              <NumberInput value={config.labelFontWeight} min={100} max={900} onChange={(v) => update('labelFontWeight', v)} />
            </Field>
            <Field label="Body Weight">
              <NumberInput value={config.bodyFontWeight} min={100} max={900} onChange={(v) => update('bodyFontWeight', v)} />
            </Field>
          </div>
        </Card>
      </Section>

      <Section title="Colors">
        <Card>
          <div className="grid grid-cols-2 gap-4">
            <ColorField label="Primary" value={config.primaryColor} onChange={(v) => update('primaryColor', v)} />
            <ColorField label="Background" value={config.backgroundColor} onChange={(v) => update('backgroundColor', v)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <ColorField label="Text" value={config.textColor} onChange={(v) => update('textColor', v)} />
            <ColorField label="Muted Text" value={config.mutedTextColor} onChange={(v) => update('mutedTextColor', v)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <ColorField label="Error" value={config.errorColor} onChange={(v) => update('errorColor', v)} />
            <ColorField label="Checked / Accent" value={config.checkedColor} onChange={(v) => update('checkedColor', v)} />
          </div>
        </Card>
      </Section>

      <Section title="Container / Card">
        <Card>
          <Slider label="Max Width" value={config.maxWidth} min={320} max={900} onChange={(v) => update('maxWidth', v)} />
          <Slider label="Padding" value={config.padding} min={12} max={64} onChange={(v) => update('padding', v)} />
          <Slider label="Border Radius" value={config.borderRadius} min={0} max={40} onChange={(v) => update('borderRadius', v)} />
          <Field label="Shadow">
            <Select
              value={config.shadow}
              onChange={(v) => update('shadow', v as FormConfig['shadow'])}
              options={[
                { value: 'default', label: 'Default' },
                { value: 'none', label: 'None' },
                { value: 'soft', label: 'Soft' },
                { value: 'strong', label: 'Strong' },
              ]}
            />
          </Field>
        </Card>
      </Section>

      <Section title="Input Fields">
        <Card>
          <div className="grid grid-cols-2 gap-4">
            <ColorField
              label="Input Background"
              value={config.inputBackgroundColor}
              onChange={(v) => update('inputBackgroundColor', v)}
            />
            <ColorField
              label="Input Border"
              value={config.inputBorderColor}
              onChange={(v) => update('inputBorderColor', v)}
            />
          </div>
          <Slider
            label="Input Radius"
            value={config.inputBorderRadius}
            min={0}
            max={24}
            onChange={(v) => update('inputBorderRadius', v)}
          />
        </Card>
      </Section>

      <Section title="Choice Controls (radio / checkbox / select)">
        <Card>
          <Slider label="Gap Between Options" value={config.optionGap} min={0} max={40} onChange={(v) => update('optionGap', v)} />
        </Card>
      </Section>

      <Section title="Navigation Buttons">
        <Card>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Prev">
              <TextInput value={config.prevLabel} onChange={(v) => update('prevLabel', v)} placeholder="PREV" />
            </Field>
            <Field label="Next">
              <TextInput value={config.nextLabel} onChange={(v) => update('nextLabel', v)} placeholder="NEXT" />
            </Field>
            <Field label="Submit">
              <TextInput value={config.submitLabel} onChange={(v) => update('submitLabel', v)} placeholder="SUBMIT" />
            </Field>
          </div>
          <Toggle
            checked={config.showArrows}
            onChange={(v) => update('showArrows', v)}
            label="Show arrow icons"
          />
          <div className="grid grid-cols-2 gap-4">
            <ColorField
              label="Button Background"
              value={config.buttonBackgroundColor}
              onChange={(v) => update('buttonBackgroundColor', v)}
            />
            <ColorField
              label="Button Text"
              value={config.buttonTextColor}
              onChange={(v) => update('buttonTextColor', v)}
            />
          </div>
          <ColorField
            label="Button Hover"
            value={config.buttonHoverColor}
            onChange={(v) => update('buttonHoverColor', v)}
          />
        </Card>
      </Section>

      <Section title="Progress Indicator">
        <Card>
          <Toggle
            checked={config.showProgress}
            onChange={(v) => update('showProgress', v)}
            label="Show progress"
            description="Display a bar or 'Step X of Y' text"
          />
          {config.showProgress && (
            <Field label="Style">
              <Select
                value={config.progressStyle}
                onChange={(v) => update('progressStyle', v as FormConfig['progressStyle'])}
                options={[
                  { value: 'bar', label: 'Progress bar' },
                  { value: 'steps', label: 'Step x of y text' },
                ]}
              />
            </Field>
          )}
        </Card>
      </Section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Settings tab
// ---------------------------------------------------------------------------

export function SettingsTab({ config, update }: FormEditorTabProps) {
  return (
    <>
      <Section title="Where submissions go">
        <Card>
          <Field label="Store submissions in the database (recommended)">
            <div className="pt-2">
              <input
                type="checkbox"
                checked={config.storeSubmissions}
                onChange={(e) => update('storeSubmissions', e.target.checked)}
                className="h-4 w-4 accent-[var(--color-accent)]"
              />
            </div>
          </Field>
          <Field label="Webhook URL (optional)">
            <TextInput
              value={config.submitWebhookUrl}
              onChange={(v) => update('submitWebhookUrl', v)}
              placeholder="https://…/hook"
            />
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              The answers are POSTed here in JSON.
            </p>
          </Field>
          <Field label="Notify email (optional)">
            <TextInput
              value={config.submitEmail}
              onChange={(v) => update('submitEmail', v)}
              placeholder="owner@example.com"
            />
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              Comma-separated addresses receive a summary of each submission.
            </p>
          </Field>
          <Toggle
            checked={config.honeypotEnabled}
            onChange={(v) => update('honeypotEnabled', v)}
            label="Honeypot spam protection"
            description="Hides a trap field bots tend to fill — submissions that trip it are silently dropped."
          />
        </Card>
      </Section>

      <Section title="Success screen">
        <Card>
          <Field label="Heading">
            <TextInput value={config.successHeading} onChange={(v) => update('successHeading', v)} placeholder="Thank you!" />
          </Field>
          <Field label="Message">
            <TextArea
              value={config.successMessage}
              onChange={(v) => update('successMessage', v)}
              rows={3}
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Redirect URL (optional)">
              <TextInput
                value={config.successRedirectUrl}
                onChange={(v) => update('successRedirectUrl', v)}
                placeholder="https://…"
              />
            </Field>
            <Field label="Delay (seconds)">
              <NumberInput
                value={config.successRedirectDelay}
                min={0}
                onChange={(v) => update('successRedirectDelay', v)}
              />
            </Field>
          </div>
        </Card>
      </Section>

      <Section title="Failure screen">
        <Card>
          <Field label="Error message">
            <TextArea
              value={config.errorMessage}
              onChange={(v) => update('errorMessage', v)}
              rows={2}
            />
          </Field>
        </Card>
      </Section>
    </>
  );
}
