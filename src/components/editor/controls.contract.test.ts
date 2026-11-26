// @vitest-environment jsdom

import { act, createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cleanupMounted,
  mount,
  setNativeValue,
  type MountedView,
} from '@/test-utils/react-dom';
import { NumberInput, Select, Slider, Toggle } from './controls';

const mounted: MountedView[] = [];

afterEach(() => {
  cleanupMounted(mounted);
});

describe('editor controls', () => {
  it('lets an editor choose one of the rendered select options', () => {
    const onChange = vi.fn();
    const container = mount(createElement(Select, {
      value: 'a',
      onChange,
      options: [
        { value: 'a', label: 'Option A' },
        { value: 'b', label: 'Option B' },
      ],
    }), mounted);
    const select = container.querySelector('select');
    if (!select) throw new Error('Select was not rendered');

    expect(Array.from(select.options, (option) => option.textContent)).toEqual([
      'Option A',
      'Option B',
    ]);
    setNativeValue(select, 'b');

    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('converts number and range input values before sending editor updates', () => {
    const numberChanged = vi.fn();
    const rangeChanged = vi.fn();
    const container = mount(createElement('div', null,
      createElement(NumberInput, {
        value: 1,
        min: 0,
        max: 10,
        onChange: numberChanged,
      }),
      createElement(Slider, {
        value: 10,
        min: 0,
        max: 100,
        label: 'Width',
        unit: '%',
        onChange: rangeChanged,
      })
    ), mounted);
    const number = container.querySelector<HTMLInputElement>('input[type="number"]');
    const range = container.querySelector<HTMLInputElement>('input[type="range"]');
    if (!number || !range) throw new Error('Numeric controls were not rendered');

    expect(container.textContent).toContain('Width: 10%');
    setNativeValue(number, '5');
    setNativeValue(range, '42');

    expect(numberChanged).toHaveBeenCalledWith(5);
    expect(rangeChanged).toHaveBeenCalledWith(42);
  });

  it('exposes toggle state as a switch and emits the next state on click', () => {
    const onChange = vi.fn();
    const container = mount(createElement(Toggle, {
      checked: false,
      onChange,
      label: 'Show attribution',
    }), mounted);
    const toggle = container.querySelector<HTMLButtonElement>('[role="switch"]');
    if (!toggle) throw new Error('Toggle was not rendered');

    expect(container.textContent).toContain('Show attribution');
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    act(() => toggle.click());

    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
