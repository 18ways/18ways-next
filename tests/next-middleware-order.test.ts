import { describe, expect, it } from 'vitest';
import { resolveWaysMiddleware } from '../next';
import { WAYS_LOCALE_COOKIE_NAME, WAYS_SESSION_LOCALE_COOKIE_NAME } from '@18ways/core/i18n-shared';

type RequestInput = {
  pathname: string;
  acceptLanguage?: string;
  preferenceCookieLocale?: string;
  sessionCookieLocale?: string;
};

const createRequest = ({
  pathname,
  acceptLanguage,
  preferenceCookieLocale,
  sessionCookieLocale,
}: RequestInput) => {
  const headers = new Headers();
  if (acceptLanguage) {
    headers.set('accept-language', acceptLanguage);
  }

  return {
    headers,
    cookies: {
      get: (name: string) => {
        if (name === WAYS_LOCALE_COOKIE_NAME && preferenceCookieLocale) {
          return { name, value: preferenceCookieLocale };
        }

        if (name === WAYS_SESSION_LOCALE_COOKIE_NAME && sessionCookieLocale) {
          return { name, value: sessionCookieLocale };
        }

        return undefined;
      },
    },
    nextUrl: {
      pathname,
      origin: 'https://example.com',
      clone: () => new URL(`https://example.com${pathname}`),
    },
  } as any;
};

describe('resolveWaysMiddleware locale engine', () => {
  it('uses driver order: session/cookie > path > browser > base', async () => {
    const fromBrowser = await resolveWaysMiddleware(
      createRequest({
        pathname: '/docs',
        acceptLanguage: 'es-ES,es;q=0.9,en;q=0.8',
      })
    );
    const fromPath = await resolveWaysMiddleware(
      createRequest({
        pathname: '/fr-FR/docs',
        acceptLanguage: 'es-ES,es;q=0.9,en;q=0.8',
      })
    );
    const fromPreferenceCookie = await resolveWaysMiddleware(
      createRequest({
        pathname: '/fr-FR/docs',
        acceptLanguage: 'es-ES,es;q=0.9,en;q=0.8',
        preferenceCookieLocale: 'de-DE',
      })
    );
    const fromSessionCookie = await resolveWaysMiddleware(
      createRequest({
        pathname: '/fr-FR/docs',
        acceptLanguage: 'es-ES,es;q=0.9,en;q=0.8',
        sessionCookieLocale: 'it-IT',
        preferenceCookieLocale: 'de-DE',
      })
    );

    expect(fromBrowser.locale).toBe('es-ES');
    expect(fromBrowser.action).toBe('redirect');
    if (fromBrowser.action === 'redirect') {
      expect(fromBrowser.redirectPathname).toBe('/es-ES/docs');
    }

    expect(fromPath.locale).toBe('fr-FR');
    expect(fromPath.action).toBe('rewrite');

    expect(fromPreferenceCookie.locale).toBe('de-DE');
    expect(fromPreferenceCookie.action).toBe('redirect');
    if (fromPreferenceCookie.action === 'redirect') {
      expect(fromPreferenceCookie.redirectPathname).toBe('/de-DE/docs');
    }

    expect(fromSessionCookie.locale).toBe('it-IT');
    expect(fromSessionCookie.action).toBe('redirect');
    if (fromSessionCookie.action === 'redirect') {
      expect(fromSessionCookie.redirectPathname).toBe('/it-IT/docs');
    }
  });

  it('treats any recognizable locale prefix as a locale candidate', async () => {
    const resolution = await resolveWaysMiddleware(
      createRequest({
        pathname: '/ja-JP/docs',
      })
    );

    expect(resolution.locale).toBe('ja-JP');
    expect(resolution.action).toBe('rewrite');
  });

  it('redirects unsupported locale prefixes to the closest accepted fallback', async () => {
    const resolution = await resolveWaysMiddleware(
      createRequest({
        pathname: '/en-US/docs',
      }),
      {
        baseLocale: 'en-GB',
        acceptedLocales: ['en-GB'],
        supportedLocales: ['en-GB'],
      }
    );

    expect(resolution.locale).toBe('en-GB');
    expect(resolution.action).toBe('redirect');
    if (resolution.action === 'redirect') {
      expect(resolution.redirectPathname).toBe('/en-GB/docs');
    }
  });

  it('uses package defaults to disable path driver reads/writes on dashboard routes', async () => {
    const resolution = await resolveWaysMiddleware(
      createRequest({
        pathname: '/fr-FR/dashboard',
        sessionCookieLocale: 'en-GB',
      })
    );

    expect(resolution.locale).toBe('en-GB');
    expect(resolution.action).toBe('continue');
    expect(resolution.unlocalizedPathname).toBe('/fr-FR/dashboard');
    expect(resolution.localizedPathname).toBe('/fr-FR/dashboard');
  });

  it('keeps sitemap locale-aware by default', async () => {
    const resolution = await resolveWaysMiddleware(
      createRequest({
        pathname: '/sitemap.xml',
        acceptLanguage: 'es-ES,es;q=0.9',
      })
    );

    expect(resolution.locale).toBe('es-ES');
    expect(resolution.action).toBe('redirect');
    if (resolution.action === 'redirect') {
      expect(resolution.redirectPathname).toBe('/es-ES/sitemap.xml');
    }
  });

  it('syncs both session and preference cookies to the resolved locale', async () => {
    const resolution = await resolveWaysMiddleware(
      createRequest({
        pathname: '/fr-FR/docs',
      })
    );

    const cookieNames = resolution.cookieUpdates.map((cookie) => cookie.name).sort();
    expect(cookieNames).toEqual([WAYS_LOCALE_COOKIE_NAME, WAYS_SESSION_LOCALE_COOKIE_NAME]);
    expect(resolution.cookieUpdates.every((cookie) => cookie.value === resolution.locale)).toBe(
      true
    );
  });
});
