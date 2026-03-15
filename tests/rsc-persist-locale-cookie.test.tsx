import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import {
  WAYS_LOCALIZED_PATHNAME_HEADER_NAME,
  WAYS_PATHNAME_HEADER_NAME,
  WAYS_PERSIST_LOCALE_COOKIE_HEADER_NAME,
} from '../next-shared';

const mockState = vi.hoisted(() => ({
  headerStore: new Headers(),
  cookieGet: vi.fn(),
  cookieGetAll: vi.fn(() => []),
}));

const nextReactWaysMock = vi.hoisted(() => vi.fn(() => null));

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => mockState.headerStore),
  cookies: vi.fn(async () => ({
    get: mockState.cookieGet,
    getAll: mockState.cookieGetAll,
  })),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}));

vi.mock('../next-react-client', () => ({
  NextReactWays: nextReactWaysMock,
}));

vi.mock('@18ways/core/common', async () => {
  const actual = await vi.importActual<typeof import('@18ways/core/common')>('@18ways/core/common');

  return {
    ...actual,
    fetchAcceptedLocales: vi.fn(async () => ['en-GB', 'es-ES']),
  };
});

describe('rsc persistLocaleCookie handoff', () => {
  beforeEach(() => {
    mockState.headerStore = new Headers({
      'accept-language': 'es-ES,es;q=0.9',
      host: '18ways.com',
      'x-forwarded-proto': 'https',
      [WAYS_PATHNAME_HEADER_NAME]: '/docs',
      [WAYS_LOCALIZED_PATHNAME_HEADER_NAME]: '/es-ES/docs',
      [WAYS_PERSIST_LOCALE_COOKIE_HEADER_NAME]: 'false',
    });
    mockState.cookieGet.mockReset();
    mockState.cookieGet.mockReturnValue(undefined);
    mockState.cookieGetAll.mockReset();
    mockState.cookieGetAll.mockReturnValue([]);
    nextReactWaysMock.mockClear();
  });

  it('passes the middleware-resolved cookie policy through to the client runtime', async () => {
    const { Ways } = await import('../rsc');

    const element = await Ways({
      apiKey: 'test-api-key',
      baseLocale: 'en-GB',
      persistLocaleCookie: true,
      children: <div>Test App</div>,
    });

    render(element);

    await waitFor(() => {
      expect(nextReactWaysMock).toHaveBeenCalled();
      expect(nextReactWaysMock.mock.calls[0]?.[0]).toEqual(
        expect.objectContaining({
          persistLocaleCookie: false,
        })
      );
    });
  });
});
