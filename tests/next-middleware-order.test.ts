import { describe, expect, it } from 'vitest';
import { resolveWaysMiddleware } from '../next';
import { WAYS_LOCALE_COOKIE_NAME } from '@18ways/core/i18n-shared';

type RequestInput = {
  pathname: string;
  acceptLanguage?: string;
  preferenceCookieLocale?: string;
};

const PATH_ROUTING = {
  exclude: ['/dashboard'],
};

const createRequest = ({ pathname, acceptLanguage, preferenceCookieLocale }: RequestInput) => {
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
  it('uses driver order: cookie > path > browser > base', async () => {
    const fromBrowser = await resolveWaysMiddleware(
      createRequest({
        pathname: '/docs',
        acceptLanguage: 'es-ES,es;q=0.9,en;q=0.8',
      }),
      { pathRouting: PATH_ROUTING }
    );
    const fromPath = await resolveWaysMiddleware(
      createRequest({
        pathname: '/fr-FR/docs',
        acceptLanguage: 'es-ES,es;q=0.9,en;q=0.8',
      }),
      { pathRouting: PATH_ROUTING }
    );
    const fromPreferenceCookie = await resolveWaysMiddleware(
      createRequest({
        pathname: '/fr-FR/docs',
        acceptLanguage: 'es-ES,es;q=0.9,en;q=0.8',
        preferenceCookieLocale: 'de-DE',
      }),
      { pathRouting: PATH_ROUTING }
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
  });

  it('treats any recognizable locale prefix as a locale candidate', async () => {
    const resolution = await resolveWaysMiddleware(
      createRequest({
        pathname: '/ja-JP/docs',
      }),
      { pathRouting: PATH_ROUTING }
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
        pathRouting: PATH_ROUTING,
        supportedLocales: ['en-GB'],
      }
    );

    expect(resolution.locale).toBe('en-GB');
    expect(resolution.action).toBe('redirect');
    if (resolution.action === 'redirect') {
      expect(resolution.redirectPathname).toBe('/en-GB/docs');
    }
  });

  it('treats language-only ranges as direct matches before regional fallbacks', async () => {
    const resolution = await resolveWaysMiddleware(
      createRequest({
        pathname: '/docs',
        acceptLanguage: 'es-MX;q=1, fr-CA;q=0.9, en;q=0.8',
      }),
      {
        baseLocale: 'en-GB',
        acceptedLocales: ['fr-FR', 'en-GB'],
        pathRouting: PATH_ROUTING,
        supportedLocales: ['fr-FR', 'en-GB'],
      }
    );

    expect(resolution.locale).toBe('en-GB');
    expect(resolution.action).toBe('redirect');
    if (resolution.action === 'redirect') {
      expect(resolution.redirectPathname).toBe('/en-GB/docs');
    }
  });

  it('prefers a language-only direct match over a lower-q later exact locale', async () => {
    const resolution = await resolveWaysMiddleware(
      createRequest({
        pathname: '/docs',
        acceptLanguage: 'fr-CA;q=1, en;q=0.9, fr-FR;q=0.8',
      }),
      {
        baseLocale: 'en-GB',
        acceptedLocales: ['fr-FR', 'en-GB'],
        pathRouting: PATH_ROUTING,
        supportedLocales: ['fr-FR', 'en-GB'],
      }
    );

    expect(resolution.locale).toBe('en-GB');
    expect(resolution.action).toBe('redirect');
    if (resolution.action === 'redirect') {
      expect(resolution.redirectPathname).toBe('/en-GB/docs');
    }
  });

  it('prefers a later exact accept-language match before an earlier fallback match', async () => {
    const resolution = await resolveWaysMiddleware(
      createRequest({
        pathname: '/docs',
        acceptLanguage: 'fr-FR;q=0.2, en-US;q=0.9',
      }),
      {
        baseLocale: 'en-GB',
        acceptedLocales: ['fr-FR', 'en-GB'],
        pathRouting: PATH_ROUTING,
        supportedLocales: ['fr-FR', 'en-GB'],
      }
    );

    expect(resolution.locale).toBe('fr-FR');
    expect(resolution.action).toBe('redirect');
    if (resolution.action === 'redirect') {
      expect(resolution.redirectPathname).toBe('/fr-FR/docs');
    }
  });

  it('uses regional fallbacks when no exact or generic language match exists', async () => {
    const resolution = await resolveWaysMiddleware(
      createRequest({
        pathname: '/docs',
        acceptLanguage: 'es-MX;q=1, fr-CA;q=0.9, de-DE;q=0.8',
      }),
      {
        baseLocale: 'en-GB',
        acceptedLocales: ['fr-FR', 'en-GB'],
        pathRouting: PATH_ROUTING,
        supportedLocales: ['fr-FR', 'en-GB'],
      }
    );

    expect(resolution.locale).toBe('fr-FR');
    expect(resolution.action).toBe('redirect');
    if (resolution.action === 'redirect') {
      expect(resolution.redirectPathname).toBe('/fr-FR/docs');
    }
  });

  it('preserves recognizable route segments when redirecting to the resolved locale', async () => {
    const resolution = await resolveWaysMiddleware(
      createRequest({
        pathname: '/pricing',
      }),
      {
        baseLocale: 'en-GB',
        acceptedLocales: ['en-GB'],
        pathRouting: PATH_ROUTING,
        supportedLocales: ['en-GB'],
      }
    );

    expect(resolution.locale).toBe('en-GB');
    expect(resolution.action).toBe('redirect');
    if (resolution.action === 'redirect') {
      expect(resolution.redirectPathname).toBe('/en-GB/pricing');
    }
  });

  it('keeps path routing disabled when no pathRouting config is provided', async () => {
    const resolution = await resolveWaysMiddleware(
      createRequest({
        pathname: '/fr-FR/dashboard',
        preferenceCookieLocale: 'en-GB',
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
      }),
      { pathRouting: PATH_ROUTING }
    );

    expect(resolution.locale).toBe('es-ES');
    expect(resolution.action).toBe('redirect');
    if (resolution.action === 'redirect') {
      expect(resolution.redirectPathname).toBe('/es-ES/sitemap.xml');
    }
  });

  it('syncs the locale cookie to the resolved locale', async () => {
    const resolution = await resolveWaysMiddleware(
      createRequest({
        pathname: '/fr-FR/docs',
      }),
      { pathRouting: PATH_ROUTING }
    );

    const cookieNames = resolution.cookieUpdates.map((cookie) => cookie.name);
    expect(cookieNames).toEqual([WAYS_LOCALE_COOKIE_NAME]);
    expect(resolution.cookieUpdates.every((cookie) => cookie.value === resolution.locale)).toBe(
      true
    );
  });
});
