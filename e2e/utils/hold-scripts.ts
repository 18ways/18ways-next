import { Page, Route } from '@playwright/test';

export async function holdScripts(page: Page) {
  let release!: () => void;

  // A promise gate that JS requests will wait on.
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  // Intercept all JavaScript files and block until released.
  await page.route('**/*.{js,mjs,jsx,ts,tsx}', async (route: Route) => {
    await gate; // Wait until continueScripts() is called.
    await route.continue();
  });

  // Exposed method for the test to resume JS loading.
  async function continueScripts(): Promise<void> {
    release(); // Allow all blocked scripts to continue.
  }

  return { continueScripts };
}
