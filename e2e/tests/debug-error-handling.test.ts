import { test, expect } from './fixtures';
import { routeHandlers, seedHandlers } from '../utils/route-handlers';

const appUrl = process.env.TEST_APP_URL!;

test.describe('Debug Error Handling', () => {
  test('debug network error - capture full page state', async ({ page }) => {
    // Capture all console messages
    const consoleMessages: string[] = [];
    const pageErrors: Error[] = [];

    page.on('console', (msg) => {
      const text = msg.text();
      consoleMessages.push(`[${msg.type()}] ${text}`);
      if (msg.type() === 'error') {
        console.error('Browser console error:', text);
      }
    });

    page.on('pageerror', (error) => {
      pageErrors.push(error);
      console.error('Page error:', error.message, error.stack);
    });

    // Capture network requests
    const networkRequests: Array<{ url: string; status?: number; error?: string }> = [];
    page.on('request', (request) => {
      if (request.url().includes('/translate') || request.url().includes('/seed')) {
        networkRequests.push({ url: request.url() });
      }
    });

    page.on('response', (response) => {
      if (response.url().includes('/translate') || response.url().includes('/seed')) {
        const idx = networkRequests.findIndex((r) => r.url === response.url());
        if (idx >= 0) {
          networkRequests[idx].status = response.status();
        }
      }
    });

    page.on('requestfailed', (request) => {
      if (request.url().includes('/translate') || request.url().includes('/seed')) {
        const idx = networkRequests.findIndex((r) => r.url === request.url());
        if (idx >= 0) {
          networkRequests[idx].error = request.failure()?.errorText || 'Unknown error';
        }
      }
    });

    // Set up error route
    await page.route('**/translate', routeHandlers.networkFailure);
    await page.route('**/seed', seedHandlers.networkFailure);

    await page.goto(appUrl);

    // Wait a bit for React to render
    await page.waitForTimeout(2000);

    // Capture full HTML
    const html = await page.content();

    // Check if root element exists
    const rootExists = (await page.locator('#root').count()) > 0;
    const appExists = (await page.locator('#app').count()) > 0;
    const helloWorldExists =
      (await page.locator('[data-translation-key="hello.world"]').count()) > 0;
    const helloWorldVisible = await page
      .locator('[data-translation-key="hello.world"]')
      .isVisible()
      .catch(() => false);

    // Get text content if element exists
    let helloWorldText = '';
    if (helloWorldExists) {
      helloWorldText =
        (await page
          .locator('[data-translation-key="hello.world"]')
          .textContent()
          .catch(() => '')) || '';
    }

    // Check if 18ways is loaded
    const waysLoaded = await page.evaluate(() => {
      return typeof window.Ways !== 'undefined' && (window as any).Ways.Ways !== undefined;
    });

    // Check what window.Ways actually is
    const waysValue = await page.evaluate(() => {
      const ways = (window as any).Ways;
      return {
        exists: typeof ways !== 'undefined',
        value: ways,
        keys: typeof ways !== 'undefined' ? Object.keys(ways) : [],
        hasWays: typeof ways !== 'undefined' && 'Ways' in ways,
        hasT: typeof ways !== 'undefined' && 'T' in ways,
        waysType: typeof ways !== 'undefined' && 'Ways' in ways ? typeof ways.Ways : 'not found',
        // Check if Ways is directly on window
        directWays: typeof (window as any).Ways === 'function',
      };
    });

    // Try to inspect the bundle execution by injecting code
    const bundleInspection = await page.evaluate(() => {
      // Try to access module.exports if it's still in scope (it won't be, but let's try)
      // Instead, let's check if we can find 18ways in the bundle's execution
      const scriptTags = Array.from(document.querySelectorAll('script[src]'));
      const waysScript = scriptTags.find((s) => s.src.includes('18ways.bundle.js'));
      return {
        waysScriptFound: !!waysScript,
        waysScriptSrc: waysScript?.src,
      };
    });

    // Get window errors
    const windowErrors = await page.evaluate(() => {
      return (window as any).__18waysErrors || [];
    });

    console.log('\n=== DEBUG INFO ===');
    console.log('Root exists:', rootExists);
    console.log('App exists:', appExists);
    console.log('Hello World element exists:', helloWorldExists);
    console.log('Hello World element visible:', helloWorldVisible);
    console.log('Hello World text:', helloWorldText);
    console.log('Ways loaded:', waysLoaded);
    console.log('Ways value keys:', waysValue.keys);
    console.log('Has Ways:', waysValue.hasWays);
    console.log('Has T:', waysValue.hasT);
    console.log('Bundle inspection:', JSON.stringify(bundleInspection, null, 2));
    console.log('Console messages:', consoleMessages.length);
    console.log('Page errors:', pageErrors.length);
    console.log('Network requests:', networkRequests.length);
    console.log('\nConsole messages:');
    consoleMessages.forEach((msg) => console.log('  ', msg));
    console.log('\nPage errors:');
    pageErrors.forEach((err) => console.log('  ', err.message));
    console.log('\nNetwork requests:');
    networkRequests.forEach((req) => console.log('  ', req));
    console.log('\nWindow errors:', windowErrors);
    console.log('\nHTML snippet (first 2000 chars):');
    console.log(html.substring(0, 2000));
    console.log('=== END DEBUG INFO ===\n');

    // Try to find the element
    const helloWorld = page.locator('[data-translation-key="hello.world"]');
    await expect(helloWorld).toBeVisible({ timeout: 10000 });
  });
});
