import { test, expect } from './fixtures';
import { routeHandlers, seedHandlers } from '../utils/route-handlers';

const getHydrationErrors = (consoleWarnings: string[], consoleErrors: string[]) => {
  return [...consoleWarnings, ...consoleErrors].filter(
    (msg) =>
      msg.toLowerCase().includes('hydration') ||
      msg.includes('does not match server-rendered') ||
      msg.includes('Hydration failed') ||
      msg.includes('Text content') ||
      msg.includes('did not match')
  );
};

test.describe('SSR Hydration with App Router', () => {
  test.onlyApps(['nextjs-basic']);

  test.beforeEach(({ page }) => {
    page.route('**/translate', routeHandlers.success);
    page.route('**/seed', seedHandlers.success);
  });

  test('should have matching HTML between SSR and client hydration', async ({ page, context }) => {
    const consoleWarnings: string[] = [];
    const consoleErrors: string[] = [];

    page.on('console', (msg) => {
      const text = msg.text();
      const type = msg.type();

      if (type === 'warning') consoleWarnings.push(text);
      if (type === 'error') consoleErrors.push(text);
    });

    // Set locale to Spanish so SSR and hydration use the same language payload.
    await context.setWaysLocale('es-ES');

    await page.goto(process.env.TEST_APP_URL!);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    // Hydration should complete without mismatch warnings.
    const hydrationErrors = getHydrationErrors(consoleWarnings, consoleErrors);
    expect(hydrationErrors.length).toBe(0);

    const helloWorld = page.locator('[data-translation-key="hello.world"]').first();
    await expect(helloWorld).toHaveText('Hola Mundo');
  });
});
