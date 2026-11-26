import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

export interface MountedView {
  container: HTMLDivElement;
  unmount: () => void;
}

export function mount(element: ReactNode, mounted: MountedView[]) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  mounted.push({ container, unmount: () => root.unmount() });
  act(() => root.render(element));
  return container;
}

export function cleanupMounted(mounted: MountedView[]) {
  while (mounted.length > 0) {
    const view = mounted.pop();
    if (!view) continue;
    act(() => view.unmount());
    view.container.remove();
  }
}

export function setNativeValue(
  element: HTMLInputElement | HTMLSelectElement,
  value: string,
) {
  const prototype = element instanceof HTMLSelectElement
    ? HTMLSelectElement.prototype
    : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  if (!setter) throw new Error('DOM value setter is unavailable');

  act(() => {
    setter.call(element, value);
    element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input', {
      bubbles: true,
    }));
  });
}

export function findButton(container: HTMLElement, label: string) {
  const match = Array.from(container.querySelectorAll('button'))
    .find((candidate) => candidate.textContent?.trim() === label);
  if (!match) throw new Error('Button was not rendered: ' + label);
  return match;
}

export function findButtonContaining(container: HTMLElement, text: string) {
  const match = Array.from(container.querySelectorAll('button'))
    .find((candidate) => candidate.textContent?.includes(text));
  if (!match) throw new Error('Button was not rendered with text: ' + text);
  return match;
}

export async function actAndFlush(action: () => void) {
  await act(async () => {
    action();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}
