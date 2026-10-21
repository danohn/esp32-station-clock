import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', timeout: 20000,
  use: { baseURL: 'http://localhost:4173', browserName: 'chromium', channel: process.env.CI ? undefined : 'chrome', headless: true },
  webServer: { command: 'npm run preview', url: 'http://localhost:4173', reuseExistingServer: !process.env.CI },
});
