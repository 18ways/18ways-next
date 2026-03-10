import { test as base, BrowserContext } from '@playwright/test';

const appName = process.env.TEST_APP_NAME;

// Define extended context type with helper methods
export interface ExtendedContext extends BrowserContext {
  setWaysLocale: (locale: string) => Promise<void>;
}

// Extend base test with automatic error logging and context helpers
const baseTest = base.extend<{}, { context: ExtendedContext }>({
  page: async ({ page }, use) => {
    // Set up error listeners before each test
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        console.error('Browser console error:', msg.text());
      }
    });

    page.on('pageerror', (error) => {
      console.error('Page error:', error.message);
    });

    // Use the page in the test
    await use(page);
  },

  context: async ({ context }, use) => {
    // Add helper method to set locale cookie
    const extendedContext = context as ExtendedContext;

    extendedContext.setWaysLocale = async (locale: string) => {
      await context.addCookies([
        {
          name: '18ways_locale',
          value: locale,
          domain: 'localhost',
          path: '/',
        },
      ]);
    };

    await use(extendedContext);
  },
});

// Extend test type with app filtering utilities
type TestType = typeof baseTest & {
  skipApps: (apps: string[]) => void;
  onlyApps: (apps: string[]) => void;
};

// Test utilities for filtering by app name
// Skips test if app IS in the blacklist
(baseTest as TestType).skipApps = (apps: string[]) => {
  baseTest.skip(appName ? apps.includes(appName) : false);
};

// Skips test if app NOT in the whitelist
(baseTest as TestType).onlyApps = (apps: string[]) => {
  baseTest.skip(!appName || !apps.includes(appName));
};

// Export with proper type
export const test = baseTest as TestType;

export { expect } from '@playwright/test';
