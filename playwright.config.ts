import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: true,
  workers: 2,
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:3107',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    reducedMotion: 'reduce',
  },
  projects: [
    {
      name: 'small-phone',
      use: {
        browserName: 'chromium',
        viewport: { width: 320, height: 640 },
        isMobile: true,
        hasTouch: true,
      },
    },
    { name: 'android', use: { ...devices['Pixel 7'] } },
    { name: 'iphone-webkit', use: { ...devices['iPhone 13'] } },
    {
      name: 'landscape',
      use: {
        browserName: 'chromium',
        viewport: { width: 844, height: 390 },
        isMobile: true,
        hasTouch: true,
      },
    },
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1440, height: 1000 } } },
  ],
  webServer: {
    command:
      'node --experimental-sqlite node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3107',
    url: 'http://127.0.0.1:3107',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
