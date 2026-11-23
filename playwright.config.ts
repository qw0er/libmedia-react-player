import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './test/e2e',
  fullyParallel: true,
  workers: 2,
  use: {
    ...devices['Desktop Chrome'],
    channel: 'chrome',
    trace: 'retain-on-failure',
  },
  webServer: {
    command:
      'npm run build && vite --config test/e2e/vite.config.ts --host 127.0.0.1 --port 0 --strictPort',
    wait: {
      stdout:
        /Local:\s+(?<PLAYWRIGHT_TEST_BASE_URL>http:\/\/127\.0\.0\.1:\d+\/)\s/,
    },
    timeout: 120_000,
  },
})
