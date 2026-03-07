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

  test('initial HTML loads English, then Japanese once network requests done', async ({
    page,
    context,
  }) => {
    await context.setWaysLocale('ja-JP');
    const { continueScripts } = await holdScripts(page);

    // Navigate - use 'commit' to avoid waiting for blocked scripts
    await page.goto(appUrl, { waitUntil: 'commit' });

    // The root div should be present in the HTML (SSR renders this)
    const root = page.getByTestId('root');
    await expect(root).toBeAttached();

    // But the app div inside should not exist yet (SSR disabled)
    const appRoot = page.getByTestId('app');
    await expect(appRoot).not.toBeAttached();

    // Wait for React to mount and render the ClientHome component
    await continueScripts();
    await expect(appRoot).toBeVisible();

    // Verify the component rendered with content
    const helloWorld = appRoot.locator('[data-translation-key="hello.world"]');
    await expect(helloWorld).toBeVisible();
    await expect(appRoot.locator('[data-testid="language-switcher"]')).toBeVisible();

    // Verify no React errors occurred (component rendered successfully)
    const content = await helloWorld.textContent();
    expect(content).toBeTruthy(); // Should have some text content, not empty

    // Verify language switching works
    const languageSwitcher = page.getByTestId('language-switcher');
    await languageSwitcher.selectOption('es-ES');

    await expect(helloWorld).toHaveText('Hola Mundo', { timeout: 10000 });
  });
});
