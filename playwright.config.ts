import { defineConfig, devices } from '@playwright/test';

// CHROMIUM_PATH: Playwright 標準のブラウザを入れられない環境で、手元の Chromium を使うための逃げ道。
const executablePath = process.env.CHROMIUM_PATH;

export default defineConfig({
  testDir: 'tests',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 8_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://localhost:8788',
    viewport: { width: 1440, height: 900 },
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: executablePath ? { executablePath, args: ['--no-sandbox'] } : {},
  },
  webServer: [
    {
      command: 'node tests/mock-google.mjs',
      url: 'http://localhost:9099/health',
      reuseExistingServer: !process.env.CI,
      timeout: 20_000,
    },
    {
      // 事前に `npm run build` が必要 (dist/ を静的アセットとして配信する)
      command: 'node scripts/e2e-server.mjs',
      url: 'http://localhost:8788/api/health',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
