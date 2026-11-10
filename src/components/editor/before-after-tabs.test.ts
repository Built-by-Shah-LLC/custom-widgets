// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultBeforeAfterConfig } from '@/lib/before-after-config';
import { SettingsTab } from './before-after-tabs';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const mounted: Array<{ container: HTMLDivElement; unmount: () => void }> = [];

afterEach(() => {
  while (mounted.length > 0) {
    const view = mounted.pop();
    if (!view) continue;
    act(() => view.unmount());
    view.container.remove();
  }
});

describe('Before/After animation duration', () => {
  it('lets an editor clear the duration so persistence can apply the documented default', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    mounted.push({ container, unmount: () => root.unmount() });
    const update = vi.fn();
    const config = { ...defaultBeforeAfterConfig, autoSlide: true };

    act(() => {
      root.render(createElement(SettingsTab, {
        config,
        update,
        widgetName: 'Comparison',
        onNameChange: vi.fn(),
      }));
    });

    const input = container.querySelector<HTMLInputElement>('input[type="number"]');
    expect(input?.value).toBe('3');

    act(() => {
      if (!input) throw new Error('Animation duration input was not rendered');
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      if (!valueSetter) throw new Error('HTML input value setter is unavailable');
      valueSetter.call(input, '');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(update).toHaveBeenCalledWith('animationDuration', 0);

    act(() => {
      root.render(createElement(SettingsTab, {
        config: { ...config, animationDuration: 0 },
        update,
        widgetName: 'Comparison',
        onNameChange: vi.fn(),
      }));
    });

    expect(container.querySelector<HTMLInputElement>('input[type="number"]')?.value).toBe('');
  });
});
