import { test, expect } from '@playwright/test'
import { existsSync, statSync } from 'node:fs'
import { login, requireCredentials } from './support/login'

/**
 * Session reuse. Ciphera ID enforces a second factor, so every fresh login
 * costs a human a trip to their authenticator AND burns a real login attempt
 * against a 7-user production identity store. We therefore persist the storage
 * state after the first successful login and reuse it while it is fresh, so a
 * re-run (a fix, a flake, a rate-limit wait) costs nothing.
 */
const STATE_FILE = process.env.SMOKE_STATE_FILE ?? '/tmp/pulse-smoke-state.json'
const STATE_MAX_AGE_MS = 30 * 60 * 1000
const stateIsFresh = () =>
  existsSync(STATE_FILE) && Date.now() - statSync(STATE_FILE).mtimeMs < STATE_MAX_AGE_MS

/**
 * Live verification of the vault read-unlock (#499) against a real deployment.
 *
 * Logs in once through Ciphera ID (OPAQUE, on the ID origin), opens the Account
 * profile, clicks Unlock, and re-enters the account's own email + password. The
 * server-authenticated /user/vault + /auth/reauth ceremony must decrypt the PII
 * in Pulse's origin and render the real email — proving the read-unlock end to
 * end without a login and without a key crossing an origin.
 *
 * STRICTLY read-only: unlock decrypts and displays; it writes nothing. Safe to
 * run against pulse-staging (which authenticates against PRODUCTION id-backend).
 *
 * baseURL from SMOKE_BASE_URL (default pulse-staging).
 */

const BASE_URL = process.env.SMOKE_BASE_URL ?? 'https://pulse-staging.ciphera.net'

test('vault read-unlock reveals the real email on the profile tab', async ({ browser }) => {
  const reusing = stateIsFresh()
  const context = await browser.newContext(reusing ? { storageState: STATE_FILE } : {})
  const page = await context.newPage()
  try {
    if (reusing) {
      console.log('Reusing a saved session — no second factor needed.')
      await page.goto(`${BASE_URL}/settings/account/profile`)
      // If the saved state expired we land back on a login bounce; fall through
      // to a real login rather than failing on a stale cookie.
      if (/\/login|id\.ciphera/.test(page.url())) await login(page, BASE_URL)
    } else {
      await login(page, BASE_URL)
    }
    // Let the post-login client-side redirect finish. Navigating into it
    // aborts the new request (net::ERR_ABORTED) — measured.
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.waitForTimeout(1500)

    // Save (or refresh) the session for the next run.
    await context.storageState({ path: STATE_FILE })

    if (!page.url().includes('/settings/account/profile')) {
      await page.goto(`${BASE_URL}/settings/account/profile`, { waitUntil: 'domcontentloaded' })
    }
    await page.waitForLoadState('networkidle').catch(() => {})

    // The locked banner offers Unlock. (If the account already shows PII, the
    // button is absent — treat that as a pass: nothing to unlock.)
    const unlockButton = page.getByRole('button', { name: 'Unlock' }).first()
    if ((await unlockButton.count()) === 0) {
      test.skip(true, 'Profile already shows PII — no locked state to exercise')
    }
    await unlockButton.click()

    const { email, password } = requireCredentials()
    await page.getByPlaceholder('Email you sign in with').fill(email)
    await page.getByPlaceholder('Password').fill(password)
    // The form's submit button (the action button is gone once the form opens).
    await page.getByRole('button', { name: /^Unlock$/ }).click()

    // The real email appears in a field on the page (the read-only profile email
    // input), and the inline unlock form closes on success.
    await expect(page.locator(`input[value="${email}"]`).first()).toBeVisible({ timeout: 20_000 })
    await expect(page.getByPlaceholder('Email you sign in with')).toHaveCount(0)

    // A reload must re-lock (PII held for the tab only, never persisted).
    await page.reload()
    await page.waitForLoadState('networkidle').catch(() => {})
    await expect(page.getByRole('button', { name: 'Unlock' }).first()).toBeVisible({ timeout: 15_000 })
  } finally {
    await context.close()
  }
})
