import { test, expect } from './fixtures';
import { routeHandlers, seedHandlers } from '../utils/route-handlers';

const appUrl = process.env.TEST_APP_URL!;

test.describe('Error Handling', () => {
  test('handles network errors gracefully', async ({ page }) => {
    await page.route('**/translate', routeHandlers.networkFailure);
    await page.route('**/seed', seedHandlers.networkFailure);

    await page.goto(appUrl);

    const helloWorld = page.locator('[data-translation-key="hello.world"]').first();
    await expect(helloWorld).toBeVisible();
    await expect(helloWorld).toHaveText(/Hello World/i);
  });

  test('handles API timeout errors', async ({ page }) => {
    await page.route('**/translate', (route) => routeHandlers.apiTimeout(route));
    await page.route('**/seed', (route) => seedHandlers.apiTimeout(route));

    await page.goto(appUrl);

    const helloWorld = page.locator('[data-translation-key="hello.world"]').first();
    await expect(helloWorld).toBeVisible();
    await expect(helloWorld).toHaveText(/Hello World/i);
  });

  test('handles malformed API responses', async ({ page }) => {
    const jsErrors: Error[] = [];
    page.on('pageerror', (error) => {
      jsErrors.push(error);
    });

    await page.route('**/translate', routeHandlers.malformedResponse);
    await page.route('**/seed', seedHandlers.malformedResponse);

    await page.goto(appUrl);

    const helloWorld = page.locator('[data-translation-key="hello.world"]').first();
    await expect(helloWorld).toBeVisible();
    await expect(helloWorld).toHaveText(/Hello World/i);

    expect(jsErrors).toHaveLength(0);
  });

  test('handles 404 translation responses', async ({ page }) => {
    await page.route('**/translate', routeHandlers.notFound404);
    await page.route('**/seed', seedHandlers.notFound404);

    await page.goto(appUrl);

    const helloWorld = page.locator('[data-translation-key="hello.world"]').first();
    await expect(helloWorld).toBeVisible();
    await expect(helloWorld).toHaveText(/Hello World/i);
  });

  test('handles 500 server errors', async ({ page }) => {
    await page.route('**/translate', routeHandlers.server500Error);
    await page.route('**/seed', seedHandlers.server500Error);

    await page.goto(appUrl);

    const helloWorld = page.locator('[data-translation-key="hello.world"]').first();
    await expect(helloWorld).toBeVisible();
    await expect(helloWorld).toHaveText(/Hello World/i);
  });

  test('recovers from failed language switch and succeeds on next attempt', async ({ page }) => {
    await page.route('**/translate', routeHandlers.spanishFails);
    await page.route('**/seed', seedHandlers.spanishFails);

    await page.goto(appUrl);

    const helloWorld = page.locator('[data-translation-key="hello.world"]').first();
    await expect(helloWorld).toBeVisible();

    const languageSwitcher = page.getByTestId('language-switcher');

    // Wait for Spanish request to complete (and fail) before moving on
    const spanishRequestPromise = page.waitForResponse(
      (response) =>
        (response.url().includes('/translate') || response.url().includes('/seed')) &&
        response.status() === 500,
      { timeout: 5000 }
    );
    await languageSwitcher.selectOption('es-ES');
    await spanishRequestPromise;

    await expect(helloWorld).toHaveText(/Hello World/i);

    await languageSwitcher.selectOption('ja-JP');

    await expect(helloWorld).toHaveText('こんにちは世界', { timeout: 10000 });
  });

  test('does not crash on empty translation responses', async ({ page }) => {
    const jsErrors: Error[] = [];
    page.on('pageerror', (error) => {
      jsErrors.push(error);
    });

    await page.route('**/translate', routeHandlers.emptyResponse);
    await page.route('**/seed', seedHandlers.emptyResponse);

    await page.goto(appUrl);

    const helloWorld = page.locator('[data-translation-key="hello.world"]').first();
    await expect(helloWorld).toBeVisible();
    await expect(helloWorld).toHaveText(/Hello World/i);

    expect(jsErrors).toHaveLength(0);
  });
});
