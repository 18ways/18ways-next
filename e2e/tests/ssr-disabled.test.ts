import { test, expect } from './fixtures';
import { routeHandlers, seedHandlers } from '../utils/route-handlers';
import { holdScripts } from '../utils/hold-scripts';

const appUrl = process.env.TEST_APP_URL!;

test.describe('SSR Disabled', () => {
  // Only run for apps that have SSR disabled (client-side only rendering)
  test.onlyApps(['nextjs-ssr-disabled']);

  test.beforeEach(({ page }) => {
    page.route('**/translate', routeHandlers.success);
    page.route('**/seed', seedHandlers.success);
  });

  test('mounts the client app after withheld scripts and honors the persisted locale', async ({
    page,
    context,
  }) => {
    await context.setWaysLocale('ja-JP');
    const { continueScripts } = await holdScripts(page);

    // Navigate - use 'commit' to avoid waiting for blocked scripts
    await page.goto(appUrl, { waitUntil: 'commit' });

    const helloWorld = page.locator('[data-translation-key="hello.world"]').first();
    await expect(helloWorld).not.toBeAttached();

    // Wait for React to mount and render the ClientHome component
    await continueScripts();
    await expect(helloWorld).toHaveText('こんにちは世界', { timeout: 10000 });

    // Verify language switching works
    const languageSwitcher = page.getByTestId('language-switcher');
    await languageSwitcher.selectOption('es-ES');

    await expect(helloWorld).toHaveText('Hola Mundo', { timeout: 10000 });
  });
});
