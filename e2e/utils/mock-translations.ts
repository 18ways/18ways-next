import { Page, Route } from '@playwright/test';

export const mockTranslations: Record<string, Record<string, string>> = {
  'hello.world': {
    'ja-JP': 'こんにちは世界',
    'es-ES': 'Hola Mundo',
    'fr-FR': 'Bonjour le monde',
    'de-DE': 'Hallo Welt',
  },
};

export interface TranslationRequest {
  key: string;
  targetLocale: string;
  content: string;
}

export interface TranslationResponse {
  key: string;
  targetLocale: string;
  translatedContent: string;
  status: 'success' | 'fallback';
}

/**
 * Setup request interception for translation API
 * Automatically clears any previous routes and starts fresh
 */
export function setupMockTranslationApi(page: Page): void {
  // Unroute any existing translation routes to start fresh
  page.unroute('**/translate');

  page.route('**/translate', async (route: Route) => {
    const request = route.request();
    const postData = request.postDataJSON();

    if (postData?.payload && Array.isArray(postData.payload)) {
      // Generate mock responses
      const results: TranslationResponse[] = postData.payload.map((item: TranslationRequest) => {
        const { key, targetLocale, content } = item;

        if (mockTranslations[key]?.[targetLocale]) {
          return {
            key,
            targetLocale,
            translatedContent: mockTranslations[key][targetLocale],
            status: 'success' as const,
          };
        }

        return {
          key,
          targetLocale,
          translatedContent: content || `[${targetLocale}] ${key}`,
          status: 'fallback' as const,
        };
      });

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: results,
          errors: [],
        }),
      });
    } else {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          errors: [{ message: 'Invalid payload format' }],
          data: [],
        }),
      });
    }
  });
}

/**
 * Setup request interception for seed API
 * Automatically clears any previous routes and starts fresh
 */
export function setupMockSeedApi(page: Page): void {
  // Unroute any existing seed routes to start fresh
  page.unroute('**/seed');

  page.route('**/seed', async (route: Route) => {
    const request = route.request();
    const postData = request.postDataJSON();

    if (
      postData?.payload &&
      Array.isArray(postData.payload.keys) &&
      postData.payload.targetLocale
    ) {
      const { keys, targetLocale } = postData.payload;

      const seedData: Record<string, string[]> = {};

      keys.forEach((key: string) => {
        if (mockTranslations[key]?.[targetLocale]) {
          seedData[key] = [mockTranslations[key][targetLocale]];
        } else {
          seedData[key] = [`[${targetLocale}] ${key}`];
        }
      });

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: seedData,
          errors: [],
        }),
      });
    } else {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          errors: [{ message: 'Invalid payload format' }],
          data: {},
        }),
      });
    }
  });
}
