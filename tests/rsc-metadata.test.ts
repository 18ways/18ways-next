import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WAYS_LOCALIZED_PATHNAME_HEADER_NAME, WAYS_PATHNAME_HEADER_NAME } from '../next-shared';

const mockState = vi.hoisted(() => ({
  headerStore: new Headers(),
  cookieGet: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => mockState.headerStore),
  cookies: vi.fn(async () => ({
    get: mockState.cookieGet,
  })),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}));

vi.mock('@18ways/core/common', async () => {
  const actual = await vi.importActual<typeof import('@18ways/core/common')>('@18ways/core/common');

  return {
    ...actual,
    fetchAcceptedLocales: vi.fn(async () => ['en-GB', 'ja-JP']),
  };
});

import { generateWaysMetadata } from '../rsc';

const PATH_ROUTING = {
  exclude: ['/dashboard'],
};

describe('rsc metadata generation', () => {
  beforeEach(() => {
    mockState.headerStore = new Headers({
      'accept-language': 'ja-JP,ja;q=0.9',
      host: '18ways.com',
      'x-forwarded-proto': 'https',
      [WAYS_PATHNAME_HEADER_NAME]: '/docs',
      [WAYS_LOCALIZED_PATHNAME_HEADER_NAME]: '/ja-JP/docs',
    });
    mockState.cookieGet.mockReset();
    mockState.cookieGet.mockReturnValue(undefined);
  });

  it('keeps canonical metadata unlocalized when path routing is omitted', async () => {
    const metadata = await generateWaysMetadata({
      apiKey: 'test-api-key',
      baseLocale: 'en-GB',
    });

    expect(metadata.alternates).toEqual({
      canonical: 'https://18ways.com/docs',
    });
  });

  it('emits localized canonical and alternates when path routing is enabled', async () => {
    const metadata = await generateWaysMetadata({
      apiKey: 'test-api-key',
      baseLocale: 'en-GB',
      pathRouting: PATH_ROUTING,
    });

    expect(metadata.alternates).toEqual({
      canonical: 'https://18ways.com/ja-JP/docs',
      languages: {
        'en-GB': 'https://18ways.com/en-GB/docs',
        'ja-JP': 'https://18ways.com/ja-JP/docs',
        'x-default': 'https://18ways.com/en-GB/docs',
      },
    });
  });
});
