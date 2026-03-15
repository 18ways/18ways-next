import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../rsc', () => ({
  Ways: vi.fn(async (props: { children: unknown }) => props.children),
  generateWaysMetadata: vi.fn(async () => ({
    alternates: { canonical: 'https://example.com/es-ES/docs' },
    openGraph: { locale: 'es_ES' },
  })),
  getWaysHtmlAttrs: vi.fn(async () => ({
    lang: 'es-ES',
    dir: 'ltr',
  })),
  WAYS_LOCALE_COOKIE_NAME: '18ways_locale',
}));

vi.mock('@18ways/core/common', async () => {
  const actual = await vi.importActual<typeof import('@18ways/core/common')>('@18ways/core/common');

  return {
    ...actual,
    init: vi.fn(),
    generateHashId: vi.fn(() => 'metadata-hash'),
    fetchSeed: vi.fn(async () => ({
      data: {},
      errors: [],
    })),
    fetchTranslations: vi.fn(async () => ({
      data: [],
      errors: [],
    })),
    fetchAcceptedLocales: vi.fn(async () => ['en-GB']),
  };
});

describe('next init', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('binds htmlAttrs to init locale options', async () => {
    const { init } = await import('../next');
    const serverModule = await import('../rsc');

    const ways = init({
      apiKey: 'test-api-key',
      baseLocale: 'en-GB',
      _apiUrl: 'https://example.com/api',
    });
    expect(typeof ways.waysMiddleware).toBe('function');

    const attrs = await ways.htmlAttrs();

    expect(serverModule.getWaysHtmlAttrs).toHaveBeenCalledWith(
      expect.objectContaining({
        locale: undefined,
        baseLocale: 'en-GB',
        apiKey: 'test-api-key',
        _apiUrl: 'https://example.com/api',
      })
    );
    expect(attrs).toEqual({
      lang: 'es-ES',
      dir: 'ltr',
    });
  });

  it('merges app metadata with generated ways metadata', async () => {
    const { init } = await import('../next');
    const serverModule = await import('../rsc');

    const ways = init({
      apiKey: 'test-api-key',
      baseLocale: 'en-GB',
      _apiUrl: 'https://example.com/api',
    });

    const metadata = await ways.generateWaysMetadata(
      {
        title: '18ways.com',
        description: 'The paths by which language becomes local',
        openGraph: {
          title: '18ways',
        },
      },
      {
        origin: 'https://18ways.com',
      }
    );

    expect(serverModule.generateWaysMetadata).toHaveBeenCalledWith(
      expect.objectContaining({
        locale: undefined,
        baseLocale: 'en-GB',
        apiKey: 'test-api-key',
        _apiUrl: 'https://example.com/api',
        origin: 'https://18ways.com',
      })
    );

    expect(metadata).toEqual({
      title: '18ways.com',
      description: 'The paths by which language becomes local',
      alternates: { canonical: 'https://example.com/es-ES/docs' },
      openGraph: {
        title: '18ways',
        locale: 'es_ES',
      },
    });
  });

  it('supports callback metadata with translator function', async () => {
    const { init } = await import('../next');
    const commonModule = await import('@18ways/core/common');
    const cryptoModule = await import('@18ways/core/crypto');
    const encryptedDescription = cryptoModule.encryptTranslationValue({
      translatedText: 'Las rutas por las que el idioma se vuelve local',
      sourceText: 'The paths by which language becomes local',
      locale: 'es-ES',
      key: '__18ways_metadata__',
      textsHash: 'metadata-hash',
      index: 0,
    });

    vi.mocked(commonModule.fetchSeed).mockResolvedValueOnce({
      data: {},
      errors: [],
    });
    vi.mocked(commonModule.fetchTranslations).mockResolvedValueOnce({
      data: [
        {
          locale: 'es-ES',
          key: '__18ways_metadata__',
          textsHash: 'metadata-hash',
          translation: [encryptedDescription],
        },
      ],
      errors: [],
    });

    const ways = init({
      apiKey: 'test-api-key',
      locale: 'es-ES',
      baseLocale: 'en-GB',
      _apiUrl: 'https://example.com/api',
    });

    const metadata = await ways.generateWaysMetadata((t) => ({
      title: '18ways.com',
      description: t('The paths by which language becomes local'),
    }));

    expect(commonModule.fetchSeed).toHaveBeenCalledWith(['__18ways_metadata__'], 'es-ES');
    expect(commonModule.fetchTranslations).toHaveBeenCalledWith([
      {
        key: '__18ways_metadata__',
        textsHash: 'metadata-hash',
        baseLocale: 'en-GB',
        targetLocale: 'es-ES',
        texts: ['The paths by which language becomes local'],
      },
    ]);

    expect(metadata).toEqual({
      title: '18ways.com',
      description: 'Las rutas por las que el idioma se vuelve local',
      alternates: { canonical: 'https://example.com/es-ES/docs' },
      openGraph: {
        locale: 'es_ES',
      },
    });
  });

  it('builds middleware options with package defaults', async () => {
    const { createWaysMiddlewareOptions } = await import('../next');

    const options = createWaysMiddlewareOptions({
      baseLocale: 'en-GB',
    });

    expect(options.baseLocale).toBe('en-GB');
    expect(options.pathRouting).toBeUndefined();
  });

  it('resolves accepted locales inside init middleware handling', async () => {
    const { init } = await import('../next');
    const { fetchAcceptedLocales } = await import('@18ways/core/common');

    const ways = init({
      apiKey: 'test-api-key',
      baseLocale: 'en-GB',
      pathRouting: {
        exclude: ['/dashboard'],
      },
      _apiUrl: 'https://example.com/api',
    });

    const headers = new Headers({
      'accept-language': 'en-US,en;q=0.9',
      host: '18ways.com',
      'x-forwarded-proto': 'https',
    });

    const response = await ways.waysMiddleware({
      headers,
      cookies: {
        get: () => undefined,
      },
      nextUrl: {
        pathname: '/docs',
        origin: 'https://18ways.com',
        clone: () => new URL('https://18ways.com/docs'),
      },
    } as any);

    expect(fetchAcceptedLocales).toHaveBeenCalledWith(
      'en-GB',
      expect.objectContaining({
        origin: 'https://18ways.com',
        apiKey: 'test-api-key',
        apiUrl: 'https://example.com/api',
        _requestInitDecorator: expect.any(Function),
      })
    );
    expect(response.headers.get('location')).toBe('https://18ways.com/en-GB/docs');
  });

  it('applies middleware from init with a request-aware cookie persistence policy', async () => {
    const { init } = await import('../next');
    const { fetchAcceptedLocales } = await import('@18ways/core/common');

    const ways = init({
      apiKey: 'test-api-key',
      baseLocale: 'en-GB',
      persistLocaleCookie: (request) => request.cookies.get('functional-consent')?.value === 'yes',
      pathRouting: {
        exclude: ['/dashboard'],
      },
      _apiUrl: 'https://example.com/api',
    });

    const response = await ways.waysMiddleware({
      headers: new Headers({
        'accept-language': 'en-US,en;q=0.9',
        host: '18ways.com',
        'x-forwarded-proto': 'https',
      }),
      cookies: {
        get: () => undefined,
      },
      nextUrl: {
        pathname: '/docs',
        origin: 'https://18ways.com',
        clone: () => new URL('https://18ways.com/docs'),
      },
    } as any);

    expect(fetchAcceptedLocales).toHaveBeenCalledWith(
      'en-GB',
      expect.objectContaining({
        origin: 'https://18ways.com',
        apiKey: 'test-api-key',
        apiUrl: 'https://example.com/api',
      })
    );
    expect(response.headers.get('location')).toBe('https://18ways.com/en-GB/docs');
    expect(response.cookies.getAll()).toEqual([]);
  });
});
