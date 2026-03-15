import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { WaysPathRoutingConfig } from '@18ways/core/i18n-shared';

const router = {
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
};

let pathname = '/';
let searchParams = new URLSearchParams('foo=1');
let currentLocale = 'en-GB';
const setCurrentLocale = vi.fn((nextLocale: string) => {
  currentLocale = nextLocale;
});

vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useRouter: () => router,
  useSearchParams: () => searchParams,
}));

vi.mock('@18ways/react', () => ({
  useCurrentLocale: () => currentLocale,
  useSetCurrentLocale: () => setCurrentLocale,
}));

import { useLocale } from '../next-client';
import { LocaleRuntimeConfigProvider } from '../next-locale-runtime';
import { LocalePathSync } from '../next-locale-sync';

const PATH_ROUTING: WaysPathRoutingConfig = {
  exclude: ['/dashboard'],
};

const LocaleChanger = ({ pathRouting }: { pathRouting?: WaysPathRoutingConfig }) => {
  const { setLocale } = useLocale({ pathRouting });

  return <button onClick={() => setLocale('es-ES')}>Switch</button>;
};

const LocaleChangerWithPathSync = () => {
  return (
    <>
      <LocalePathSync pathRouting={PATH_ROUTING} />
      <LocaleChanger pathRouting={PATH_ROUTING} />
    </>
  );
};

const LocaleChangerWithDefaults = () => {
  const { setLocale } = useLocale();

  return <button onClick={() => setLocale('es-ES')}>Switch</button>;
};

const UnsupportedLocaleChanger = () => {
  const { setLocale } = useLocale();

  return <button onClick={() => setLocale('ja-JP')}>Switch Unsupported</button>;
};

describe('useLocale', () => {
  beforeEach(() => {
    pathname = '/';
    searchParams = new URLSearchParams('foo=1');
    currentLocale = 'en-GB';
    router.push.mockReset();
    router.replace.mockReset();
    router.refresh.mockReset();
    setCurrentLocale.mockClear();
    document.cookie = '18ways_locale=; Max-Age=0; Path=/';
    document.cookie =
      '18ways_cookie_consent=' +
      encodeURIComponent(JSON.stringify({ categories: ['necessary', 'functional'] })) +
      '; Path=/';
    window.__18WAYS_ACCEPTED_LOCALES__ = ['en-GB', 'es-ES'];
  });

  it('updates locale state and refreshes when path routing is disabled', async () => {
    pathname = '/dashboard/organizations';

    render(<LocaleChangerWithDefaults />);
    fireEvent.click(screen.getByRole('button', { name: 'Switch' }));

    expect(document.cookie).toContain('18ways_locale=es-ES');
    await waitFor(() => {
      expect(setCurrentLocale).toHaveBeenCalledWith('es-ES');
      expect(router.refresh).toHaveBeenCalledTimes(1);
      expect(router.replace).not.toHaveBeenCalled();
      expect(router.push).not.toHaveBeenCalled();
    });
  });

  it('uses localized path navigation when routing is enabled', async () => {
    pathname = '/en-GB/docs';
    window.history.replaceState({}, '', '/en-GB/docs?foo=1');

    render(<LocaleChanger pathRouting={PATH_ROUTING} />);
    fireEvent.click(screen.getByRole('button', { name: 'Switch' }));

    expect(window.location.pathname).toBe('/es-ES/docs');
    expect(window.location.search).toBe('?foo=1');
    expect(document.cookie).toContain('18ways_locale=es-ES');
    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/es-ES/docs?foo=1', { scroll: false });
      expect(router.refresh).not.toHaveBeenCalled();
      expect(setCurrentLocale).toHaveBeenCalledWith('es-ES');
    });
  });

  it('does not duplicate driver writes when LocalePathSync is mounted beside useLocale', async () => {
    pathname = '/en-GB/docs';
    window.history.replaceState({}, '', '/en-GB/docs?foo=1');

    render(<LocaleChangerWithPathSync />);
    fireEvent.click(screen.getByRole('button', { name: 'Switch' }));

    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledTimes(1);
      expect(router.replace).toHaveBeenCalledWith('/es-ES/docs?foo=1', { scroll: false });
      expect(setCurrentLocale).toHaveBeenCalledTimes(1);
      expect(setCurrentLocale).toHaveBeenCalledWith('es-ES');
      expect(document.cookie).toContain('18ways_locale=es-ES');
    });
  });

  it('noops when setting a locale outside accepted locales', async () => {
    pathname = '/en-GB/docs';

    render(<UnsupportedLocaleChanger />);
    fireEvent.click(screen.getByRole('button', { name: 'Switch Unsupported' }));

    await waitFor(() => {
      expect(setCurrentLocale).not.toHaveBeenCalledWith('ja-JP');
      expect(router.replace).not.toHaveBeenCalled();
      expect(router.push).not.toHaveBeenCalled();
      expect(router.refresh).not.toHaveBeenCalled();
    });
  });

  it('inherits locale cookie persistence from the runtime config', async () => {
    pathname = '/dashboard/organizations';

    render(
      <LocaleRuntimeConfigProvider persistLocaleCookie={false}>
        <LocaleChangerWithDefaults />
      </LocaleRuntimeConfigProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Switch' }));

    expect(document.cookie).not.toContain('18ways_locale=es-ES');
  });

  it('does not rewrite the locale cookie when LocalePathSync is mounted and runtime persistence is disabled', async () => {
    pathname = '/en-GB/docs';
    window.history.replaceState({}, '', '/en-GB/docs?foo=1');

    render(
      <LocaleRuntimeConfigProvider persistLocaleCookie={false}>
        <LocaleChangerWithPathSync />
      </LocaleRuntimeConfigProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Switch' }));

    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/es-ES/docs?foo=1', { scroll: false });
      expect(setCurrentLocale).toHaveBeenCalledWith('es-ES');
      expect(document.cookie).not.toContain('18ways_locale=es-ES');
    });
  });
});
