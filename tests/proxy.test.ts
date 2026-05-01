import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WAYS_LOCALE_COOKIE_NAME } from '@18ways/core/i18n-shared';

vi.mock('@18ways/core/common', async () => {
  const actual = await vi.importActual<typeof import('@18ways/core/common')>('@18ways/core/common');

  return {
    ...actual,
    fetchAcceptedLocales: vi.fn(async () => ['en-GB', 'fr-FR', 'de-DE']),
  };
});

const routeManifest = {
  localized: ['/', '/blog', '/blog/[slug]', '/docs/[[...slug]]', '/pricing', '/sign-in'],
  unlocalized: ['/api/config', '/dashboard', '/dashboard/organizations/[id]', '/invite/[token]'],
  ambiguous: [],
};

const pathRouting = {
  exclude: ['/api/config', '/dashboard', '/dashboard/organizations/*', '/invite/*'],
};

describe('proxy locale negotiation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects root requests to the best locale from fetched accepted locales', async () => {
    const { fetchAcceptedLocales } = await import('@18ways/core/common');
    const { getWaysProxyResponse } = await import('../proxy');

    const response = await getWaysProxyResponse(
      new NextRequest('https://18ways.com/', {
        headers: {
          'accept-language': 'fr-FR,fr;q=0.9,en;q=0.7',
          host: '18ways.com',
          'x-forwarded-proto': 'https',
        },
      }),
      {
        router: 'app',
        baseLocale: 'en-GB',
        apiKey: 'test-api-key',
      }
    );

    expect(fetchAcceptedLocales).toHaveBeenCalledWith('en-GB', {
      origin: 'https://18ways.com',
    });
    expect(response?.status).toBe(307);
    expect(response?.headers.get('location')).toBe('https://18ways.com/fr-FR');
    expect(response?.headers.get('vary')).toContain('Accept-Language');
    expect(response?.headers.get('vary')).toContain('Cookie');
  });

  it('prefers the locale cookie over accept-language for root redirects', async () => {
    const { getWaysProxyResponse } = await import('../proxy');

    const response = await getWaysProxyResponse(
      new NextRequest('https://18ways.com/', {
        headers: {
          'accept-language': 'fr-FR,fr;q=0.9,en;q=0.7',
          cookie: `${WAYS_LOCALE_COOKIE_NAME}=de-DE`,
          host: '18ways.com',
          'x-forwarded-proto': 'https',
        },
      }),
      {
        router: 'app',
        baseLocale: 'en-GB',
        apiKey: 'test-api-key',
      }
    );

    expect(response?.headers.get('location')).toBe('https://18ways.com/de-DE');
  });

  it('does not fetch accepted locales when they are configured explicitly', async () => {
    const { fetchAcceptedLocales } = await import('@18ways/core/common');
    const { getWaysProxyResponse } = await import('../proxy');

    const response = await getWaysProxyResponse(
      new NextRequest('https://18ways.com/', {
        headers: {
          'accept-language': 'fr-FR,fr;q=0.9,en;q=0.7',
          host: '18ways.com',
          'x-forwarded-proto': 'https',
        },
      }),
      {
        router: 'app',
        baseLocale: 'en-GB',
        acceptedLocales: ['en-GB', 'fr-FR'],
      }
    );

    expect(fetchAcceptedLocales).not.toHaveBeenCalled();
    expect(response?.headers.get('location')).toBe('https://18ways.com/fr-FR');
  });

  it('does not fetch accepted locales for non-root requests without domain routing', async () => {
    const { fetchAcceptedLocales } = await import('@18ways/core/common');
    const { getWaysProxyResponse } = await import('../proxy');

    const response = await getWaysProxyResponse(
      new NextRequest('https://18ways.com/api/config', {
        headers: {
          host: '18ways.com',
          'x-forwarded-proto': 'https',
        },
      }),
      {
        router: 'app',
        baseLocale: 'en-GB',
        apiKey: 'test-api-key',
      }
    );

    expect(response).toBeNull();
    expect(fetchAcceptedLocales).not.toHaveBeenCalled();
  });

  it('redirects unlocalized manifest pages to the negotiated locale pathname', async () => {
    const { getWaysProxyResponse } = await import('../proxy');

    const response = await getWaysProxyResponse(
      new NextRequest('https://18ways.com/pricing?ref=launch', {
        headers: {
          'accept-language': 'fr-FR,fr;q=0.9,en;q=0.7',
          host: '18ways.com',
          'x-forwarded-proto': 'https',
        },
      }),
      {
        router: 'app',
        baseLocale: 'en-GB',
        acceptedLocales: ['en-GB', 'fr-FR'],
        pathRouting,
        routeManifest,
      }
    );

    expect(response?.status).toBe(307);
    expect(response?.headers.get('location')).toBe('https://18ways.com/fr-FR/pricing?ref=launch');
    expect(response?.headers.get('vary')).toContain('Accept-Language');
    expect(response?.headers.get('vary')).toContain('Cookie');
  });

  it('matches optional catch-all manifest pages at the route root and nested pathnames', async () => {
    const { getWaysProxyResponse } = await import('../proxy');

    const rootResponse = await getWaysProxyResponse(
      new NextRequest('https://18ways.com/docs', {
        headers: {
          cookie: `${WAYS_LOCALE_COOKIE_NAME}=de-DE`,
          host: '18ways.com',
          'x-forwarded-proto': 'https',
        },
      }),
      {
        router: 'app',
        baseLocale: 'en-GB',
        acceptedLocales: ['en-GB', 'de-DE'],
        pathRouting,
        routeManifest,
      }
    );

    const nestedResponse = await getWaysProxyResponse(
      new NextRequest('https://18ways.com/docs/nextjs/usage?tab=api', {
        headers: {
          cookie: `${WAYS_LOCALE_COOKIE_NAME}=de-DE`,
          host: '18ways.com',
          'x-forwarded-proto': 'https',
        },
      }),
      {
        router: 'app',
        baseLocale: 'en-GB',
        acceptedLocales: ['en-GB', 'de-DE'],
        pathRouting,
        routeManifest,
      }
    );

    expect(rootResponse?.headers.get('location')).toBe('https://18ways.com/de-DE/docs');
    expect(nestedResponse?.headers.get('location')).toBe(
      'https://18ways.com/de-DE/docs/nextjs/usage?tab=api'
    );
  });

  it('does not redirect localized or path-routing-excluded pathnames', async () => {
    const { fetchAcceptedLocales } = await import('@18ways/core/common');
    const { getWaysProxyResponse } = await import('../proxy');

    const localizedResponse = await getWaysProxyResponse(
      new NextRequest('https://18ways.com/fr-FR/pricing', {
        headers: {
          host: '18ways.com',
          'x-forwarded-proto': 'https',
        },
      }),
      {
        router: 'app',
        baseLocale: 'en-GB',
        apiKey: 'test-api-key',
        pathRouting,
        routeManifest,
      }
    );

    const dashboardResponse = await getWaysProxyResponse(
      new NextRequest('https://18ways.com/dashboard/organizations/org_123', {
        headers: {
          'accept-language': 'fr-FR,fr;q=0.9,en;q=0.7',
          host: '18ways.com',
          'x-forwarded-proto': 'https',
        },
      }),
      {
        router: 'app',
        baseLocale: 'en-GB',
        apiKey: 'test-api-key',
        pathRouting,
        routeManifest,
      }
    );

    expect(localizedResponse).toBeNull();
    expect(dashboardResponse).toBeNull();
    expect(fetchAcceptedLocales).not.toHaveBeenCalled();
  });

  it('does not redirect unmatched unlocalized pathnames', async () => {
    const { fetchAcceptedLocales } = await import('@18ways/core/common');
    const { getWaysProxyResponse } = await import('../proxy');

    const response = await getWaysProxyResponse(
      new NextRequest('https://18ways.com/missing-page', {
        headers: {
          'accept-language': 'fr-FR,fr;q=0.9,en;q=0.7',
          host: '18ways.com',
          'x-forwarded-proto': 'https',
        },
      }),
      {
        router: 'app',
        baseLocale: 'en-GB',
        apiKey: 'test-api-key',
        pathRouting,
        routeManifest,
      }
    );

    expect(response).toBeNull();
    expect(fetchAcceptedLocales).not.toHaveBeenCalled();
  });
});
