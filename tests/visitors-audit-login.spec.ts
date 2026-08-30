import { test, expect } from '@playwright/test'
import { login } from './support/login'

/**
 * Session capture for the 30-08-2026 Visitors audit.
 *
 * Its ONLY job is to log in once and persist the cookie jar, so that every
 * later audit walkthrough runs free. Kept separate from the walkthrough
 * deliberately: a code the owner fetches by hand must not be spent on a run
 * that can fail for any other reason.
 *
 * 🔴 IT DELIBERATELY DOES NOT CALL test.setTimeout(). The config derives the
 * per-test budget from CIPHERA_ID_TOTP_WAIT_SECONDS (120 s + the wait); a
 * spec-level setTimeout OVERRIDES that and silently shortens the window a
 * person is told they have.
 *
 * ⚠️ The state file is a live credential — scratch directory only.
 */
const BASE_URL = process.env.SMOKE_BASE_URL ?? 'https://pulse-staging.ciphera.net'
const STATE_PATH = process.env.VISITORS_STORAGE_STATE ?? ''
const SITE_ID = process.env.VISITORS_SITE_ID ?? ''

test('cache an authenticated staging session', async ({ page }) => {
  if (!STATE_PATH) throw new Error('Set VISITORS_STORAGE_STATE')
  await login(page, BASE_URL)
  await page.context().storageState({ path: STATE_PATH })
  // eslint-disable-next-line no-console
  console.log(`SESSION CACHED AT ${STATE_PATH}`)

  // Prove the session actually reaches the surface under audit, in the same
  // run — a saved cookie jar that cannot open the page is not a saved session.
  if (SITE_ID) {
    await page.goto(`${BASE_URL}/sites/${SITE_ID}/visitors?period=30`)
    await expect(page.getByRole('heading', { name: 'Visitors', level: 1 })).toBeVisible({
      timeout: 30_000,
    })
    // eslint-disable-next-line no-console
    console.log('SESSION VERIFIED AGAINST /visitors')
  }
})
