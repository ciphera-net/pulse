import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright config for the read-only authed smoke suite (tests/*.spec.ts).
 *
 * baseURL is driven by SMOKE_BASE_URL and defaults to the pulse-frontend
 * staging host — the same origin the CI canary hits post-deploy. Credentials
 * are read from the environment by the spec's login helper; none live here.
 *
 * Note: the repo's unit tests are Vitest (`*.test.ts`, run via `npm test`).
 * Playwright only owns `*.spec.ts`, so the two never collide.
 */

const BASE_URL = process.env.SMOKE_BASE_URL ?? 'https://pulse-staging.ciphera.net'

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    headless: true,
    ignoreHTTPSErrors: true,
    viewport: { width: 1440, height: 900 },
    actionTimeout: 15_000,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
})
