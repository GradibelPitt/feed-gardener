import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  testMatch: /(accounts|api-settings)\.spec\.ts/,
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: process.env.ACCOUNT_TEST_URL || 'http://127.0.0.1:3109',
    reducedMotion: 'reduce',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'account-desktop',
      use: { browserName: 'chromium', viewport: { width: 1440, height: 1000 } },
    },
    {
      name: 'account-mobile',
      use: {
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
});
