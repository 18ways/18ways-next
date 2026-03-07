import { defineConfig, devices } from '@playwright/test';
import os from 'os';

const jsonOutputFile = process.env.PLAYWRIGHT_JSON_OUTPUT_FILE || 'test-results/results.json';
const progressFile = process.env.PLAYWRIGHT_PROGRESS_FILE || 'test-results/.progress.json';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : os.cpus().length,
  reporter: [
    ['json', { outputFile: jsonOutputFile }],
    ['./utils/progress-reporter.ts', { progressFile }],
  ],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Disable unnecessary features for speed
        launchOptions: {
          args: [
            '--disable-dev-shm-usage',
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-gpu',
          ],
        },
      },
    },
  ],
  timeout: 30000,
});
