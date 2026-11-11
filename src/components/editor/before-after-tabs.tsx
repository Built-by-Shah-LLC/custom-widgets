'use client';

import { useRef, useState } from 'react';
import type { BeforeAfterConfig } from '@/lib/before-after-config';
import { Input as KitInput } from '@/components/ui';
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

export interface BeforeAfterTabProps {
  config: BeforeAfterConfig;
  update: <K extends keyof BeforeAfterConfig>(key: K, value: BeforeAfterConfig[K]) => void;
  widgetName: string;
  onNameChange: (name: string) => void;
}

// Aspect-ratio values with a dedicated dropdown option; anything else stored
// in the DB is treated as a custom 'W:H' ratio.
const PRESET_RATIOS = ['16:9', '21:9', '4:3', '3:2', '1:1', 'auto'];

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
      <div className="mb-2 flex h-28 items-center justify-center overflow-hidden rounded-lg bg-[var(--color-bg-secondary)]">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={label} className="h-full w-full object-cover" />
        ) : (
          <span className="text-xs text-[var(--color-text-muted)]">No image set</span>
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
          <TextInput value={url} onChange={onChange} placeholder="https://… image URL" />
        </div>
      </div>
    </Field>
  );
}

export function ContentTab({ config, update, widgetName, onNameChange }: BeforeAfterTabProps) {
  return (
    <>
      <Section title="Name">
        <Card>
          <TextInput value={widgetName} onChange={onNameChange} placeholder="Widget name" />
        </Card>
      </Section>

      <Section title="Images">
        <Card>
          <ImageField
            label="Before"
            url={config.beforeImageUrl}
            onChange={(v) => update('beforeImageUrl', v)}
          />
          <ImageField
            label="After"
            url={config.afterImageUrl}
            onChange={(v) => update('afterImageUrl', v)}
          />
        </Card>
      </Section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Style tab
// ---------------------------------------------------------------------------

export function StyleTab({ config, update }: BeforeAfterTabProps) {
  return (
    <>
      <Section title="Theme">
        <Card>
          <Toggle
            checked={config.useSiteTheme}
            onChange={(v) => update('useSiteTheme', v)}
            label="Use Site Theme"
            description="Apply your website's theme colors"
          />
        </Card>
      </Section>

      <Section title="Colors">
        <Card>
          <Field label="Background">
            <Select
              value={config.backgroundType}
              onChange={(v) => update('backgroundType', v as BeforeAfterConfig['backgroundType'])}
              options={[
                { value: 'transparent', label: 'Transparent' },
                { value: 'solid', label: 'Solid' },
              ]}
            />
          </Field>
          {config.backgroundType === 'solid' && (
            <ColorField
              label="Background Color"
              value={config.backgroundColor}
              onChange={(v) => update('backgroundColor', v)}
            />
          )}
          <div className="grid grid-cols-2 gap-4">
            <ColorField
              label="Label Background"
              value={config.labelBackgroundColor}
              onChange={(v) => update('labelBackgroundColor', v)}
            />
            <ColorField
              label="Text Color"
              value={config.labelTextColor}
              onChange={(v) => update('labelTextColor', v)}
            />
          </div>
        </Card>
      </Section>

      <Section title="Typography & Shape">
        <Card>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Font">
              <Select
                value={config.fontFamily}
                onChange={(v) => update('fontFamily', v)}
                options={[
                  { value: 'inherit', label: 'Inherit from Website' },
                  { value: 'system-ui', label: 'System Default' },
                  { value: 'Poppins', label: 'Poppins' },
                  { value: 'Inter', label: 'Inter' },
                  { value: 'Roboto', label: 'Roboto' },
                  { value: 'Open Sans', label: 'Open Sans' },
                  { value: 'Lato', label: 'Lato' },
                  { value: 'Montserrat', label: 'Montserrat' },
                  { value: 'Arial', label: 'Arial' },
                ]}
              />
            </Field>
            <Field label="Shadow">
              <Select
                value={config.shadow}
                onChange={(v) => update('shadow', v as BeforeAfterConfig['shadow'])}
                options={[
                  { value: 'default', label: 'Default' },
                  { value: 'none', label: 'None' },
                  { value: 'soft', label: 'Soft' },
                  { value: 'strong', label: 'Strong' },
                ]}
              />
            </Field>
          </div>
          <Slider
            label="Border Radius"
            value={config.borderRadius}
            min={0}
            max={40}
            onChange={(v) => update('borderRadius', v)}
          />
        </Card>
      </Section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Layout tab
// ---------------------------------------------------------------------------

export function LayoutTab({ config, update }: BeforeAfterTabProps) {
  const isCustomRatio = !PRESET_RATIOS.includes(config.aspectRatio);
  const [customW, customH] = ((): [number, number] => {
    const [w, h] = config.aspectRatio.split(':').map(Number);
    return w > 0 && h > 0 ? [w, h] : [2, 1];
  })();

  return (
    <>
      <Section title="Labels">
        <Card>
          <div className="grid grid-cols-2 gap-4">
            <TextInput
              value={config.beforeLabel}
              onChange={(v) => update('beforeLabel', v)}
              placeholder="Before"
            />
            <TextInput
              value={config.afterLabel}
              onChange={(v) => update('afterLabel', v)}
              placeholder="After"
            />
          </div>
        </Card>
      </Section>

      <Section title="Size">
        <Card>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Width Type">
              <Select
                value={config.widthType}
                onChange={(v) => update('widthType', v as BeforeAfterConfig['widthType'])}
                options={[
                  { value: 'percentage', label: 'Percentage (%)' },
                  { value: 'fixed', label: 'Fixed (px)' },
                ]}
              />
            </Field>
            <Field label={config.widthType === 'fixed' ? 'Value (px)' : 'Value (%)'}>
              <NumberInput
                value={config.widthValue}
                min={1}
                max={config.widthType === 'fixed' ? undefined : 100}
                onChange={(v) => update('widthValue', v)}
              />
            </Field>
          </div>
          <Field label="Aspect Ratio">
            <Select
              value={isCustomRatio ? 'custom' : config.aspectRatio}
              onChange={(v) =>
                update(
                  'aspectRatio',
                  v === 'custom'
                    ? `${customW}:${customH}`
                    : (v as BeforeAfterConfig['aspectRatio'])
                )
              }
              options={[
                { value: '16:9', label: '16:9 (Widescreen)' },
                { value: '21:9', label: '21:9 (Ultra Wide)' },
                { value: '4:3', label: '4:3 (Traditional)' },
                { value: '3:2', label: '3:2 (Photography)' },
                { value: '1:1', label: '1:1 (Square)' },
                { value: 'auto', label: 'Auto (Natural)' },
                { value: 'custom', label: 'Custom' },
              ]}
            />
            {isCustomRatio && (
              <div className="mt-3 grid grid-cols-2 gap-4">
                <Field label="Ratio Width">
                  <NumberInput
                    value={customW}
                    min={1}
                    onChange={(w) => update('aspectRatio', `${w}:${customH}`)}
                  />
                </Field>
                <Field label="Ratio Height">
                  <NumberInput
                    value={customH}
                    min={1}
                    onChange={(h) => update('aspectRatio', `${customW}:${h}`)}
                  />
                </Field>
              </div>
            )}
          </Field>
          <Slider
            label="Slider Position"
            value={config.sliderPosition}
            min={0}
            max={100}
            unit="%"
            onChange={(v) => update('sliderPosition', v)}
          />
        </Card>
      </Section>

      <Section title="Display">
        <Card>
          <Toggle
            checked={config.showLabels}
            onChange={(v) => update('showLabels', v)}
            label="Before/After Labels"
          />
          <Toggle
            checked={config.showInstructionText}
            onChange={(v) => update('showInstructionText', v)}
            label="Instruction Text"
          />
        </Card>
      </Section>

      {config.showInstructionText && (
        <Section title="Instruction Text">
          <Card>
            <Field label="Text">
              <TextInput
                value={config.instructionText}
                onChange={(v) => update('instructionText', v)}
                placeholder="Drag to compare"
              />
            </Field>
            <Slider
              label="Size"
              value={config.instructionSize}
              min={10}
              max={24}
              onChange={(v) => update('instructionSize', v)}
            />
          </Card>
        </Section>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Settings tab
// ---------------------------------------------------------------------------

// Number input that can be fully cleared while typing. An empty field is
// stored as 0 and normalized to the default (3s) on save / at runtime.
function ClearableSecondsInput({
  value,
  min = 1,
  max = 30,
  onChange,
}: {
  value: number;
  min?: number;
  max?: number;
  onChange: (v: number) => void;
}) {
  return (
    <KitInput
      type="number"
      value={value >= 1 ? value : ''}
      min={min}
      max={max}
      onChange={(e) => {
        const v = e.target.value;
        onChange(v === '' ? 0 : Number(v));
      }}
    />
  );
}

export function SettingsTab({ config, update }: BeforeAfterTabProps) {
  return (
    <Section title="Slider Behavior">
      <Card>
        <Toggle
          checked={config.captureTouchMode}
          onChange={(v) => update('captureTouchMode', v)}
          label="Capture Touch Mode"
          description="Tap anywhere to move the slider"
        />
        <Toggle
          checked={config.autoSlide}
          onChange={(v) => update('autoSlide', v)}
          label="Play One Animation Cycle"
          description="Makes one 25%–75% round trip, then stays at the starting side until dragged"
        />
        {config.autoSlide && (
          <Field label="Animation Duration (seconds)">
            <ClearableSecondsInput
              value={config.animationDuration}
              min={1}
              max={30}
              onChange={(v) => update('animationDuration', v)}
            />
          </Field>
        )}
      </Card>
    </Section>
  );
}
