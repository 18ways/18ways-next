// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { PathLocaleDriver } from '../drivers/path-locale-driver';

describe('PathLocaleDriver listeners', () => {
  it('syncs to path locale when history changes to a localized path', async () => {
    const sync = vi.fn();

    const cleanup = PathLocaleDriver.handleListeners(
      {
        pathname: '/docs',
        baseLocale: 'en-GB',
      },
      sync
    ) as () => void;
    expect(typeof cleanup).toBe('function');

    window.history.pushState({}, '', '/fr-FR/docs');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(sync).toHaveBeenCalledWith('fr-FR');

    cleanup();
  });

  it('does not sync once listeners are cleaned up', async () => {
    const sync = vi.fn();

    const cleanup = PathLocaleDriver.handleListeners(
      {
        pathname: '/docs',
        baseLocale: 'en-GB',
      },
      sync
    ) as () => void;
    expect(typeof cleanup).toBe('function');

    cleanup();

    window.history.pushState({}, '', '/es-ES/docs');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(sync).not.toHaveBeenCalled();
  });
});
