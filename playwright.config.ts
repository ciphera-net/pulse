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

/**
 * Per-test budget, WIDENED to cover an interactive second-factor wait.
 *
 * 🔴 The login helper advertises a 20-minute wait for a pasted TOTP code
 * (support/login.ts, widened 30-08-2026 after two runs timed out on a human's
 * trip to their authenticator). It could never elapse: the wait sits inside a
 * test, and this timeout was a flat 120 s, so every interactive run died at two
 * minutes no matter what CIPHERA_ID_TOTP_WAIT_SECONDS said. The fix had been
 * applied to the layer that waits and not to the layer that GATES the wait —
 * so the widening looked done and changed nothing.
 *
 * The budget is now DERIVED from the same variable the helper reads, so the two
 * cannot disagree again. An unattended run (CIPHERA_ID_TOTP_SECRET set, or CI)
 * never reaches the prompt and keeps the tight 120 s.
 */
const TOTP_WAIT_MS =
  process.env.CIPHERA_ID_TOTP_SECRET || process.env.CI
    ? 0
    : Number(process.env.CIPHERA_ID_TOTP_WAIT_SECONDS ?? 1200) * 1000

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  timeout: 120_000 + TOTP_WAIT_MS,
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
