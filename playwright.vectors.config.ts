import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright config for the crypto vectors in real browsers (lib/crypto/__tests__/browser): the
 * production HPKE and team-names modules, bundled, run on the RFC 9180 and team-names-v1 vector
 * files in Chromium, Firefox and WebKit. CI runs it (.woodpecker/test.yml, step crypto-vectors);
 * locally, `npm run test:crypto-vectors` after `npx playwright install chromium firefox webkit`.
 *
 * Kept apart from playwright.config.ts, the hand-run smoke suite against staging: this one reaches
 * no server (the page comes from page.route), so it has no baseURL and no client certificate, and
 * it never retries, because a known-answer test that passes on a second try has failed.
 */

export default defineConfig({
  testDir: './lib/crypto/__tests__/browser',
  testMatch: '**/*.spec.ts',
  timeout: 30_000,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: [['list']],
  outputDir: './test-results/crypto-vectors',
  use: { headless: true },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
})
