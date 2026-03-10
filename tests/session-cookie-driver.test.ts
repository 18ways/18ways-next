import { describe, expect, it, vi } from 'vitest';
import { SessionCookieDriver } from '../drivers/session-cookie-driver';
import { WAYS_LOCALE_COOKIE_NAME, WAYS_SESSION_LOCALE_COOKIE_NAME } from '@18ways/core/i18n-shared';

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

  it('does not write locale cookies when functional consent is not granted', async () => {
    const writeCookie = vi.fn();

    await SessionCookieDriver.setLocale('es-ES', {
      pathname: '/docs',
      baseLocale: 'en-GB',
      readCookie: () => null,
      writeCookie,
    });

    expect(writeCookie).not.toHaveBeenCalled();
  });

  it('writes locale cookies when functional consent is granted', async () => {
    const writeCookie = vi.fn();
    const consentValue = JSON.stringify({
      categories: ['necessary', 'functional'],
    });

    await SessionCookieDriver.setLocale('es-ES', {
      pathname: '/docs',
      baseLocale: 'en-GB',
      readCookie: (cookieName) => (cookieName === '18ways_cookie_consent' ? consentValue : null),
      writeCookie,
    });

    expect(writeCookie).toHaveBeenCalledTimes(2);
    expect(writeCookie).toHaveBeenCalledWith(
      WAYS_SESSION_LOCALE_COOKIE_NAME,
      'es-ES',
      expect.any(Object)
    );
    expect(writeCookie).toHaveBeenCalledWith(WAYS_LOCALE_COOKIE_NAME, 'es-ES', expect.any(Object));
  });
});
