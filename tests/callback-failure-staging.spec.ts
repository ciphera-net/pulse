import { test, expect } from '@playwright/test'

/**
 * Option C on a deployed stack (design §10.11.12): a failed code exchange must
 * render the existing "expired" card — never the marketing homepage — and must
 * report the RAW upstream code.
 *
 * Costs nothing to run: a pending attempt is seeded straight into localStorage,
 * so the callback accepts the state, exchanges the bogus code, and id-backend
 * answers 400 invalid_grant for real. No session, no TOTP.
 *
 * Run: SMOKE_BASE_URL=https://pulse-staging.ciphera.net npx playwright test tests/callback-failure-staging.spec.ts
 */
const BASE = process.env.SMOKE_BASE_URL ?? 'https://pulse-staging.ciphera.net'

test('a spent code shows "This sign-in link has expired" and reports invalid_grant', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  // * reportClientEvent prefers navigator.sendBeacon, whose body Playwright cannot
  // * read — the first run of this spec saw the POST answered 204 and asserted on an
  // * empty body. The helper already falls back to fetch when sendBeacon is absent;
  // * removing it in the test context exercises the same event path with a body the
  // * harness can see. Measured 05-09-2026 against the deployed C build.
  await ctx.addInitScript(() => { Object.defineProperty(navigator, 'sendBeacon', { value: undefined, configurable: true }) })
  const page = await ctx.newPage()

  const events: string[] = []
  page.on('request', (r) => {
    if (r.url().includes('/api/client-errors')) {
      try { events.push(JSON.parse(r.postData() ?? '{}').message ?? '') } catch { events.push(r.postData() ?? '') }
    }
  })

  // Seed the pending attempt the callback will look up by state.
  await page.goto(`${BASE}/pricing`, { waitUntil: 'domcontentloaded' })
  const state = 'soak-' + Math.random().toString(36).slice(2, 14)
  await page.evaluate((s) => {
    localStorage.setItem(`oauth_pending:${s}`, JSON.stringify({ verifier: 'v'.repeat(43), createdAt: Date.now() }))
  }, state)

  await page.goto(`${BASE}/auth/callback?code=spent-code-${state}&state=${state}`, { waitUntil: 'domcontentloaded' })

  // The screen: the existing stale_attempt card, restart only.
  await expect(page.getByRole('heading', { name: /this sign-in link has expired/i })).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('button', { name: /start sign-in again/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /try again/i })).toHaveCount(0)
  expect(new URL(page.url()).pathname, 'must not have bounced to the homepage').toBe('/auth/callback')

  // The trace: the raw upstream code, not the mapped type.
  await expect.poll(() => events.some((e) => e === 'oauth_exchange_failed:invalid_grant'), { timeout: 10_000 })
    .toBe(true)

  await ctx.close()
})
