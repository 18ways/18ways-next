import { test, expect } from './fixtures';
import { routeHandlers, seedHandlers } from '../utils/route-handlers';

const appUrl = process.env.TEST_APP_URL!;

test.describe('Core Translation Functionality', () => {
  test.beforeEach(({ page }) => {
    page.route('**/translate', routeHandlers.success);
    page.route('**/seed', seedHandlers.success);
  });

  test('loads in English, switches to Japanese, then Spanish', async ({ page }) => {
    await page.goto(appUrl);

    const helloWorld = page.locator('[data-translation-key="hello.world"]').first();
    const welcome = page.locator('[data-translation-key="welcome.message"]').first();
    const goodbye = page.locator('[data-translation-key="goodbye.message"]').first();

    await expect(helloWorld).toBeVisible();

    // Should start in English
    await expect(helloWorld).toHaveText(/Hello World/i);
    await expect(welcome).toHaveText(/Welcome/i);
    await expect(goodbye).toHaveText(/Goodbye/i);

    const languageSwitcher = page.getByTestId('language-switcher');
    await expect(languageSwitcher).toBeVisible();

    // Switch to Japanese - verify all elements update
    await languageSwitcher.selectOption('ja-JP');
    await expect(helloWorld).toHaveText('こんにちは世界', { timeout: 10000 });
    await expect(welcome).toHaveText('ようこそ', { timeout: 10000 });
    await expect(goodbye).toHaveText('さようなら', { timeout: 10000 });

    // Switch to Spanish - verify all elements update
    await languageSwitcher.selectOption('es-ES');
    await expect(helloWorld).toHaveText('Hola Mundo', { timeout: 10000 });
    await expect(welcome).toHaveText('Bienvenido', { timeout: 10000 });
    await expect(goodbye).toHaveText('Adiós', { timeout: 10000 });
  });
});
