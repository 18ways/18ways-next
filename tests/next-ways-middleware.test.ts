import { describe, expect, it } from 'vitest';
import { waysMiddleware } from '../next';
import { WAYS_LOCALE_COOKIE_NAME } from '@18ways/core/i18n-shared';

type RequestInput = {
  pathname: string;
  acceptLanguage?: string;
};

const PATH_ROUTING = {
  exclude: [],
};

const createRequest = ({ pathname, acceptLanguage }: RequestInput) => {
  const headers = new Headers();
  if (acceptLanguage) {
    headers.set('accept-language', acceptLanguage);
  }

  return {
    headers,
    cookies: {
      get: () => undefined,
    },
    nextUrl: {
      pathname,
      origin: 'https://example.com',
      clone: () => new URL(`https://example.com${pathname}`),
    },
  } as any;
};

describe('waysMiddleware', () => {
  it('handles the default next/rewrite response flow', async () => {
    const response = await waysMiddleware(
      createRequest({
        pathname: '/fr-FR/docs',
        acceptLanguage: 'fr-FR,fr;q=0.9',
      }),
      { pathRouting: PATH_ROUTING }
    );

    expect(response.headers.get('x-middleware-rewrite')).toBe('https://example.com/docs');
    expect(response.cookies.getAll().map((cookie) => cookie.name)).toEqual([
      WAYS_LOCALE_COOKIE_NAME,
    ]);
  });

  it('supports request-header and response transforms', async () => {
    const response = await waysMiddleware(
      createRequest({
        pathname: '/fr-FR/docs',
        acceptLanguage: 'fr-FR,fr;q=0.9',
      }),
      {
        pathRouting: PATH_ROUTING,
        transformRequestHeaders: (context) => {
          context.requestHeaders.set('x-ways-test', '1');
        },
        transformResponse: (response, context) => {
          response.headers.set('x-ways-custom', '1');
          response.headers.set(
            'x-ways-seen-request-header',
            context.requestHeaders.get('x-ways-test') || '0'
          );
          return response;
        },
      }
    );

    expect(response.headers.get('x-middleware-rewrite')).toBe('https://example.com/docs');
    expect(response.headers.get('x-ways-custom')).toBe('1');
    expect(response.headers.get('x-ways-seen-request-header')).toBe('1');
  });
});
