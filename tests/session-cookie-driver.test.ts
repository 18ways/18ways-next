import { describe, expect, it, vi } from 'vitest';
import { SessionCookieDriver } from '../drivers/session-cookie-driver';
import { WAYS_LOCALE_COOKIE_NAME } from '@18ways/core/i18n-shared';

describe('SessionCookieDriver', () => {
  it('continues locale sync when cookie writes are blocked', async () => {
    const setCurrentLocale = vi.fn();

    await expect(
      SessionCookieDriver.setLocale('es-ES', {
        pathname: '/docs',
        baseLocale: 'en-GB',
        writeCookie: () => {
          throw new Error('Cookie write blocked');
        },
        setCurrentLocale,
      })
    ).resolves.toBeUndefined();

    expect(setCurrentLocale).toHaveBeenCalledWith('es-ES');
  });

  it('reads from the canonical locale cookie', () => {
    const locale = SessionCookieDriver.getLocale({
      pathname: '/docs',
      baseLocale: 'en-GB',
      readCookie: (cookieName) => (cookieName === WAYS_LOCALE_COOKIE_NAME ? 'fr-FR' : null),
    });

    expect(locale).toBe('fr-FR');
  });

  it('writes locale cookies by default', async () => {
    const writeCookie = vi.fn();

    await SessionCookieDriver.setLocale('es-ES', {
      pathname: '/docs',
      baseLocale: 'en-GB',
      writeCookie,
    });

    expect(writeCookie).toHaveBeenCalledTimes(1);
    expect(writeCookie).toHaveBeenCalledWith(WAYS_LOCALE_COOKIE_NAME, 'es-ES', expect.any(Object));
  });

  it('does not write locale cookies when persistence is disabled', async () => {
    const writeCookie = vi.fn();

    await SessionCookieDriver.setLocale('es-ES', {
      pathname: '/docs',
      baseLocale: 'en-GB',
      persistLocaleCookie: false,
      writeCookie,
    });

    expect(writeCookie).not.toHaveBeenCalled();
  });

  it('writes the persistent locale cookie with cookie options', async () => {
    const writeCookie = vi.fn();

    await SessionCookieDriver.setLocale('es-ES', {
      pathname: '/docs',
      baseLocale: 'en-GB',
      writeCookie,
    });

    expect(writeCookie).toHaveBeenCalledWith(WAYS_LOCALE_COOKIE_NAME, 'es-ES', {
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'lax',
      path: '/',
    });
  });
});
