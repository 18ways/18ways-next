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
const setCurrentLocale = vi.fn();

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

const LocaleChanger = ({ pathRouting }: { pathRouting?: WaysPathRoutingConfig }) => {
  const { setLocale } = useLocale({ pathRouting });

  return <button onClick={() => setLocale('es-ES')}>Switch</button>;
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
    setCurrentLocale.mockReset();
    document.cookie = '18ways-locale=; Max-Age=0; Path=/';
    window.__18WAYS_ACCEPTED_LOCALES__ = ['en-GB', 'es-ES'];
  });

  it('updates locale state and refreshes when path routing is disabled', async () => {
    pathname = '/dashboard/organizations';

    render(<LocaleChangerWithDefaults />);
    fireEvent.click(screen.getByRole('button', { name: 'Switch' }));

    expect(document.cookie).toContain('18ways-locale=es-ES');
    await waitFor(() => {
      expect(setCurrentLocale).toHaveBeenCalledWith('es-ES');
      expect(router.refresh).toHaveBeenCalledTimes(1);
      expect(router.replace).not.toHaveBeenCalled();
      expect(router.push).not.toHaveBeenCalled();
    });
  });

  it('uses localized path navigation when routing is enabled', async () => {
    pathname = '/en-GB/docs';

    render(<LocaleChanger />);
    fireEvent.click(screen.getByRole('button', { name: 'Switch' }));

    expect(document.cookie).toContain('18ways-locale=es-ES');
    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/es-ES/docs?foo=1');
      expect(router.refresh).not.toHaveBeenCalled();
      expect(setCurrentLocale).toHaveBeenCalledWith('es-ES');
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
});
