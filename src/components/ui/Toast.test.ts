// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { showSaveResult } from './Toast';

describe('showSaveResult', () => {
  it('turns a live-cache lag into a persistent warning for the user', () => {
    let detail: unknown;
    window.addEventListener('show-toast', (event) => {
      detail = (event as CustomEvent).detail;
    }, { once: true });

    showSaveResult(
      { liveCacheWarning: 'The live site can lag for up to 24h.' },
      'Domain updated'
    );

    expect(detail).toEqual({
      message: 'Domain updated. The live site can lag for up to 24h.',
      type: 'warning',
      duration: 8000,
    });
  });

  it('reports an ordinary successful save without a warning duration', () => {
    let detail: unknown;
    window.addEventListener('show-toast', (event) => {
      detail = (event as CustomEvent).detail;
    }, { once: true });

    showSaveResult({ fresh: true }, 'Domain added');

    expect(detail).toEqual({
      message: 'Domain added',
      type: 'success',
      duration: undefined,
    });
  });
});
