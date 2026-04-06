import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
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
    fetchAcceptedLocales: vi.fn(async () => ['en-GB', 'es-ES']),
  };
});

describe('rsc ways accepted locales handoff', () => {
  beforeEach(() => {
    mockState.headerStore = new Headers({
      'accept-language': 'es-ES,es;q=0.9',
      host: '18ways.com',
      'x-forwarded-proto': 'https',
      [WAYS_PATHNAME_HEADER_NAME]: '/docs',
      [WAYS_LOCALIZED_PATHNAME_HEADER_NAME]: '/es-ES/docs',
    });
    mockState.cookieGet.mockReset();
    mockState.cookieGet.mockReturnValue(undefined);
    delete window.__18WAYS_TRANSLATION_STORE__;
    vi.clearAllMocks();
  });

  it('does not refetch accepted locales on the client when next already resolved them', async () => {
    const { fetchAcceptedLocales } = await import('@18ways/core/common');
    const { Ways } = await import('../rsc');

    const element = await Ways({
      apiKey: 'test-api-key',
      baseLocale: 'en-GB',
      children: <div>Test App</div>,
    });

    expect(fetchAcceptedLocales).toHaveBeenCalledTimes(1);

    render(element);

    await waitFor(() => {
      expect(window.__18WAYS_TRANSLATION_STORE__?.config.acceptedLocales).toEqual([
        'en-GB',
        'es-ES',
      ]);
      expect(fetchAcceptedLocales).toHaveBeenCalledTimes(1);
    });
  });

  it('uses the highest-q browser locale when seeding accepted locale resolution', async () => {
    mockState.headerStore = new Headers({
      'accept-language': 'fr-FR;q=0.2, es-ES;q=0.9',
      host: '18ways.com',
      'x-forwarded-proto': 'https',
      [WAYS_PATHNAME_HEADER_NAME]: '/docs',
      [WAYS_LOCALIZED_PATHNAME_HEADER_NAME]: '/es-ES/docs',
    });

    const { fetchAcceptedLocales } = await import('@18ways/core/common');
    const { Ways } = await import('../rsc');

    await Ways({
      apiKey: 'test-api-key',
      children: <div>Test App</div>,
    });

    expect(fetchAcceptedLocales).toHaveBeenCalledWith('es-ES', {
      origin: 'https://18ways.com',
    });
  });

  it('uses the base locale when resolving accepted locales for the app shell', async () => {
    const { fetchAcceptedLocales } = await import('@18ways/core/common');
    const { Ways } = await import('../rsc');

    await Ways({
      apiKey: 'test-api-key',
      locale: 'es-ES',
      baseLocale: 'en-US',
      children: <div>Test App</div>,
    });

    expect(fetchAcceptedLocales).toHaveBeenCalledWith('en-US', {
      origin: 'https://18ways.com',
    });
  });

  it('uses explicit accepted locales as the single app-shell source of truth', async () => {
    const { fetchAcceptedLocales } = await import('@18ways/core/common');
    const { Ways } = await import('../rsc');

    const element = await Ways({
      apiKey: 'test-api-key',
      baseLocale: 'en-GB',
      acceptedLocales: ['ja-JP'],
      children: <div>Test App</div>,
    });

    expect(fetchAcceptedLocales).not.toHaveBeenCalled();

    render(element);

    await waitFor(() => {
      expect(window.__18WAYS_TRANSLATION_STORE__?.config.acceptedLocales).toEqual([
        'en-GB',
        'ja-JP',
      ]);
    });
  });
});
