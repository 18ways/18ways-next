import { Route } from '@playwright/test';
import { encryptTranslationValue } from './translation-crypto';

export interface RouteHandlerOptions {
  delayMs?: number;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
};

function isPreflightRequest(route: Route): boolean {
  return route.request().method() === 'OPTIONS';
}

async function fulfillPreflight(route: Route): Promise<void> {
  await route.fulfill({
    status: 204,
    headers: CORS_HEADERS,
    body: '',
  });
}

async function handlePreflightIfNeeded(route: Route): Promise<boolean> {
  if (!isPreflightRequest(route)) {
    return false;
  }
  await fulfillPreflight(route);
  return true;
}

async function fulfillJson(route: Route, status: number, body: string): Promise<void> {
  await route.fulfill({
    status,
    contentType: 'application/json',
    headers: CORS_HEADERS,
    body,
  });
}

function getPostDataJson(route: Route): any {
  try {
    return route.request().postDataJSON();
  } catch {
    return undefined;
  }
}

export const textTranslations: Record<string, Record<string, string>> = {
  'Hello World': {
    'ja-JP': 'こんにちは世界',
    'es-ES': 'Hola Mundo',
    'fr-FR': 'Bonjour le monde',
    'de-DE': 'Hallo Welt',
  },
  Welcome: {
    'ja-JP': 'ようこそ',
    'es-ES': 'Bienvenido',
    'fr-FR': 'Bienvenue',
    'de-DE': 'Willkommen',
  },
  Goodbye: {
    'ja-JP': 'さようなら',
    'es-ES': 'Adiós',
    'fr-FR': 'Au revoir',
    'de-DE': 'Auf Wiedersehen',
  },
};

function createSuccessResponse(postData: any): string {
  const results =
    postData?.payload?.map((item: any) => {
      const { key, targetLocale, textHash, text } = item;
      const translatedText = textTranslations[text]?.[targetLocale] || text;

      return {
        locale: targetLocale,
        key,
        textHash,
        translation: encryptTranslationValue({
          translatedText,
          sourceText: text,
          locale: targetLocale,
          key,
          textHash,
        }),
      };
    }) || [];

  return JSON.stringify({ data: results, errors: [] });
}

export const routeHandlers = {
  networkFailure: async (route: Route) => {
    if (await handlePreflightIfNeeded(route)) return;
    await route.abort('failed');
  },

  apiTimeout: async (route: Route, options: RouteHandlerOptions = {}) => {
    if (await handlePreflightIfNeeded(route)) return;
    const delay = options.delayMs ?? 100;
    await new Promise((resolve) => setTimeout(resolve, delay));
    await fulfillJson(route, 200, JSON.stringify({ data: [], errors: [] }));
  },

  malformedResponse: async (route: Route) => {
    if (await handlePreflightIfNeeded(route)) return;
    await fulfillJson(route, 200, 'not valid json {{{');
  },

  notFound404: async (route: Route) => {
    if (await handlePreflightIfNeeded(route)) return;
    await fulfillJson(route, 404, JSON.stringify({ error: 'Not found' }));
  },

  server500Error: async (route: Route) => {
    if (await handlePreflightIfNeeded(route)) return;
    await fulfillJson(route, 500, JSON.stringify({ error: 'Internal server error' }));
  },

  spanishFails: async (route: Route) => {
    if (await handlePreflightIfNeeded(route)) return;
    const postData = getPostDataJson(route);
    const firstPayloadLocale = postData?.payload?.[0]?.targetLocale;

    if (firstPayloadLocale === 'es-ES') {
      await fulfillJson(
        route,
        500,
        JSON.stringify({ error: 'Internal server error', data: [], errors: [] })
      );
    } else {
      await fulfillJson(route, 200, createSuccessResponse(postData));
    }
  },

  emptyResponse: async (route: Route) => {
    if (await handlePreflightIfNeeded(route)) return;
    await fulfillJson(
      route,
      200,
      JSON.stringify({
        data: [],
        errors: [],
      })
    );
  },

  success: async (route: Route) => {
    if (await handlePreflightIfNeeded(route)) return;
    const postData = getPostDataJson(route);
    await fulfillJson(route, 200, createSuccessResponse(postData));
  },

  slowSuccess: async (route: Route, options: RouteHandlerOptions = {}) => {
    if (await handlePreflightIfNeeded(route)) return;
    const delay = options.delayMs ?? 1000;
    await new Promise((resolve) => setTimeout(resolve, delay));
    const postData = getPostDataJson(route);
    await fulfillJson(route, 200, createSuccessResponse(postData));
  },
};

export type RouteHandlerName = keyof typeof routeHandlers;

export const routeHandlerDescriptions: Record<RouteHandlerName, string> = {
  networkFailure: 'Network request fails (aborted)',
  apiTimeout: 'API times out and returns empty response',
  malformedResponse: 'Server returns invalid JSON',
  notFound404: 'Server returns 404 Not Found',
  server500Error: 'Server returns 500 Internal Server Error',
  spanishFails: 'Spanish translations fail with 500, others succeed',
  emptyResponse: 'Server returns empty data array',
  success: 'All translations succeed normally',
  slowSuccess: 'All translations succeed but with a delay (default 1s)',
};

export function setupRouteHandler(
  page: any,
  handlerName: RouteHandlerName,
  options?: RouteHandlerOptions
) {
  const handler = routeHandlers[handlerName];
  if (!handler) {
    throw new Error(`Unknown route handler: ${handlerName}`);
  }

  page.route('**/translate', (route: Route) => {
    if (isPreflightRequest(route)) {
      return fulfillPreflight(route);
    }
    return handler(route, options);
  });
}

function createSeedSuccessResponse(postData: any): string {
  const { keys, targetLocale } = postData?.payload || {};

  if (!keys || !Array.isArray(keys) || !targetLocale) {
    return JSON.stringify({ data: {}, errors: [] });
  }

  const seedData: Record<string, string> = {};

  return JSON.stringify({ data: seedData, errors: [] });
}

export const seedHandlers = {
  networkFailure: async (route: Route) => {
    if (await handlePreflightIfNeeded(route)) return;
    await route.abort('failed');
  },

  apiTimeout: async (route: Route, options: RouteHandlerOptions = {}) => {
    if (await handlePreflightIfNeeded(route)) return;
    const delay = options.delayMs ?? 100;
    await new Promise((resolve) => setTimeout(resolve, delay));
    await fulfillJson(route, 200, JSON.stringify({ data: {}, errors: [] }));
  },

  malformedResponse: async (route: Route) => {
    if (await handlePreflightIfNeeded(route)) return;
    await fulfillJson(route, 200, 'not valid json {{{');
  },

  notFound404: async (route: Route) => {
    if (await handlePreflightIfNeeded(route)) return;
    await fulfillJson(route, 404, JSON.stringify({ error: 'Not found' }));
  },

  server500Error: async (route: Route) => {
    if (await handlePreflightIfNeeded(route)) return;
    await fulfillJson(route, 500, JSON.stringify({ error: 'Internal server error' }));
  },

  emptyResponse: async (route: Route) => {
    if (await handlePreflightIfNeeded(route)) return;
    await fulfillJson(
      route,
      200,
      JSON.stringify({
        data: {},
        errors: [],
      })
    );
  },

  spanishFails: async (route: Route) => {
    if (await handlePreflightIfNeeded(route)) return;
    const postData = getPostDataJson(route);
    const targetLocale = postData?.payload?.targetLocale;

    if (targetLocale === 'es-ES') {
      await fulfillJson(
        route,
        500,
        JSON.stringify({ error: 'Internal server error', data: {}, errors: [] })
      );
      return;
    }

    await fulfillJson(route, 200, createSeedSuccessResponse(postData));
  },

  success: async (route: Route) => {
    if (await handlePreflightIfNeeded(route)) return;
    const postData = getPostDataJson(route);
    await fulfillJson(route, 200, createSeedSuccessResponse(postData));
  },

  slowSuccess: async (route: Route, options: RouteHandlerOptions = {}) => {
    if (await handlePreflightIfNeeded(route)) return;
    const delay = options.delayMs ?? 1000;
    await new Promise((resolve) => setTimeout(resolve, delay));
    const postData = getPostDataJson(route);
    await fulfillJson(route, 200, createSeedSuccessResponse(postData));
  },
};

export type SeedHandlerName = keyof typeof seedHandlers;

export const seedHandlerDescriptions: Record<SeedHandlerName, string> = {
  networkFailure: 'Network request fails (aborted)',
  apiTimeout: 'API times out and returns empty response',
  malformedResponse: 'Server returns invalid JSON',
  notFound404: 'Server returns 404 Not Found',
  server500Error: 'Server returns 500 Internal Server Error',
  emptyResponse: 'Server returns empty data object',
  spanishFails: 'Spanish seed fails with 500, others succeed',
  success: 'Seed data fetched successfully',
  slowSuccess: 'Seed data fetched successfully but with a delay (default 1s)',
};

export function setupSeedHandler(
  page: any,
  handlerName: SeedHandlerName,
  options?: RouteHandlerOptions
) {
  const handler = seedHandlers[handlerName];
  if (!handler) {
    throw new Error(`Unknown seed handler: ${handlerName}`);
  }

  page.route('**/seed', (route: Route) => {
    if (isPreflightRequest(route)) {
      return fulfillPreflight(route);
    }
    return handler(route, options);
  });
}
