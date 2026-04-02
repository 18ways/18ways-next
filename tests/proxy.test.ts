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
});
