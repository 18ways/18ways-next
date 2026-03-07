import { test, expect } from './fixtures';
import { routeHandlers, seedHandlers } from '../utils/route-handlers';

const appUrl = process.env.TEST_APP_URL!;

test.describe('Loading States', () => {
  test.beforeEach(({ page }) => {
    const getTargetLocale = (route: any): string | undefined => {
      try {
        const body = route.request().postDataJSON();
        return body?.payload?.targetLocale || body?.payload?.[0]?.targetLocale;
      } catch {
        return undefined;
      }
    };

    page.route('**/translate', (route) => {
      const targetLocale = getTargetLocale(route);
      // Make Spanish intentionally slower than other locales to validate loading-state behavior.
      const delayMs = targetLocale === 'es-ES' ? 1600 : 200;
      return routeHandlers.slowSuccess(route, { delayMs });
    });

    page.route('**/seed', (route) => {
      const targetLocale = getTargetLocale(route);
      const delayMs = targetLocale === 'es-ES' ? 1600 : 200;
      return seedHandlers.slowSuccess(route, { delayMs });
    });
  });

  test('retains previous translation while loading next language', async ({ page }) => {
    await page.goto(appUrl);

    const helloWorld = page.locator('[data-translation-key="hello.world"]').first();
    const languageSwitcher = page.getByTestId('language-switcher');

    // Start in English
    await expect(helloWorld).toHaveText(/Hello World/i);

    // Switch to Japanese and wait for it to load
    await languageSwitcher.selectOption('ja-JP');
    await expect(helloWorld).toHaveText('こんにちは世界', { timeout: 10000 });

    // Now switch to Spanish - this will take 1 second to load
    await languageSwitcher.selectOption('es-ES');

    // Check 600ms into the load - should still show Japanese, NOT flash back to English
    await page.waitForTimeout(600);
    const textDuringLoad = await helloWorld.textContent();

    // Spanish is intentionally delayed so Japanese should remain visible mid-load.
    expect(textDuringLoad).toBe('こんにちは世界');
    expect(textDuringLoad).not.toBe('Hello World');

    // Wait for Spanish to finish loading
    await expect(helloWorld).toHaveText('Hola Mundo', { timeout: 10000 });
  });
});
