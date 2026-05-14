import { test, expect } from './fixtures';
import { routeHandlers, seedHandlers } from '../utils/route-handlers';

const appUrl = process.env.TEST_APP_URL!;

test.describe('Error Handling', () => {
  test('does not crash when translation responses are malformed', async ({ page }) => {
    const jsErrors: Error[] = [];
    page.on('pageerror', (error) => {
      jsErrors.push(error);
    });

    await page.route('**/translate', routeHandlers.malformedResponse);
    await page.route('**/seed', seedHandlers.malformedResponse);

    await page.goto(appUrl);

    const helloWorld = page.locator('[data-translation-key="hello.world"]').first();
    await expect(helloWorld).toHaveText(/Hello World/i);

    expect(jsErrors).toHaveLength(0);
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

  test('shuts down runtime after payment required response', async ({ page }) => {
    let seedRequests = 0;
    let translateRequests = 0;
    const billingConsoleErrors: string[] = [];

    page.on('console', (message) => {
      if (message.type() === 'error' && message.text().includes('Translation has been disabled')) {
        billingConsoleErrors.push(message.text());
      }
    });

    await page.route('**/translate', async (route) => {
      translateRequests += 1;
      const payload = route.request().postDataJSON() as
        | { payload?: Array<{ targetLocale?: string }> }
        | undefined;
      const targetLocale = payload?.payload?.[0]?.targetLocale;
      if (targetLocale === 'es-ES') {
        return routeHandlers.paymentRequired(route);
      }
      return routeHandlers.success(route);
    });
    await page.route('**/seed', async (route) => {
      seedRequests += 1;
      return seedHandlers.success(route);
    });

    await page.goto(appUrl);

    const helloWorld = page.locator('[data-translation-key="hello.world"]').first();
    await expect(helloWorld).toHaveText(/Hello World/i);
    const translateRequestsBeforePaymentBlock = translateRequests;

    const paymentRequiredResponse = page.waitForResponse(
      (response) => response.url().includes('/translate') && response.status() === 402,
      { timeout: 5000 }
    );
    await page.getByTestId('language-switcher').selectOption('es-ES');
    await paymentRequiredResponse;
    const translateRequestsAfterPaymentBlock = translateRequests;

    await expect(helloWorld).toHaveText(/Hello World/i);
    await expect.poll(() => billingConsoleErrors.length, { timeout: 5000 }).toBe(1);

    const librarySwitcherButton = page
      .getByTestId('library-language-switcher')
      .locator('button[aria-haspopup="listbox"]');
    await expect(librarySwitcherButton).toBeDisabled();

    await page.waitForTimeout(500);
    expect(seedRequests).toBeLessThanOrEqual(1);
    expect(translateRequestsAfterPaymentBlock).toBeGreaterThan(translateRequestsBeforePaymentBlock);
    expect(translateRequests).toBe(translateRequestsAfterPaymentBlock);
  });
});
