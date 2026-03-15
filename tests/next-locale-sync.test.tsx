import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import type { WaysPathRoutingConfig } from '@18ways/core/i18n-shared';

const router = {
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
};

let pathname = '/';
let currentLocale = 'en-GB';
const setCurrentLocale = vi.fn((nextLocale: string) => {
  currentLocale = nextLocale;
});

vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useRouter: () => router,
}));

vi.mock('@18ways/react', () => ({
  useCurrentLocale: () => currentLocale,
  useSetCurrentLocale: () => setCurrentLocale,
}));

import { LocalePathSync } from '../next-locale-sync';
import { LocaleRuntimeConfigProvider } from '../next-locale-runtime';

const PATH_ROUTING: WaysPathRoutingConfig = {
  exclude: ['/dashboard'],
};

describe('LocalePathSync', () => {
  beforeEach(() => {
    pathname = '/';
    currentLocale = 'en-GB';
    router.push.mockReset();
    router.replace.mockReset();
    router.refresh.mockReset();
    setCurrentLocale.mockClear();
    document.cookie = '18ways_locale=; Max-Age=0; Path=/';
    window.__18WAYS_ACCEPTED_LOCALES__ = ['en-GB', 'es-ES', 'fr-FR'];
    window.history.replaceState({}, '', '/');
  });

  it('syncs the locale cookie from the resolved path locale on initial mount', async () => {
    pathname = '/fr-FR/docs';
    window.history.replaceState({}, '', '/fr-FR/docs');

    render(<LocalePathSync pathRouting={PATH_ROUTING} />);

    await waitFor(() => {
      expect(setCurrentLocale).toHaveBeenCalledWith('fr-FR');
      expect(document.cookie).toContain('18ways_locale=fr-FR');
      expect(router.replace).not.toHaveBeenCalled();
    });
  });

  it('syncs path routing and cookie when the active locale changes externally', async () => {
    pathname = '/en-GB/docs';
    window.history.replaceState({}, '', '/en-GB/docs');

    const view = render(<LocalePathSync pathRouting={PATH_ROUTING} />);

    await waitFor(() => {
      expect(document.cookie).toContain('18ways_locale=en-GB');
    });

    setCurrentLocale.mockClear();
    router.replace.mockClear();

    currentLocale = 'es-ES';
    view.rerender(<LocalePathSync pathRouting={PATH_ROUTING} />);

    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/es-ES/docs', { scroll: false });
      expect(document.cookie).toContain('18ways_locale=es-ES');
      expect(setCurrentLocale).toHaveBeenCalledWith('es-ES');
    });
  });

  it('does not rewrite the locale cookie when runtime cookie persistence is disabled', async () => {
    pathname = '/fr-FR/docs';
    window.history.replaceState({}, '', '/fr-FR/docs');

    render(
      <LocaleRuntimeConfigProvider persistLocaleCookie={false}>
        <LocalePathSync pathRouting={PATH_ROUTING} />
      </LocaleRuntimeConfigProvider>
    );

    await waitFor(() => {
      expect(setCurrentLocale).toHaveBeenCalledWith('fr-FR');
      expect(document.cookie).not.toContain('18ways_locale=fr-FR');
      expect(router.replace).not.toHaveBeenCalled();
    });
  });
});
