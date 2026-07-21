import type { Page } from '@playwright/test'

/**
 * Shared OPAQUE login helper for authed smoke/E2E specs.
 *
 * Mirrors the id.ciphera.net round-trip that the workspace-level billing E2E
 * (`Pulse/tests/billing.spec.ts`) performs: navigate to the app, and if the
 * app bounces us to the Ciphera ID login (the password never reaches Pulse —
 * OPAQUE is negotiated on the ID origin), fill the ID form and wait to land
 * back on the app.
 *
 * Credentials are sourced ONLY from the environment — never hardcoded:
 *   - CIPHERA_ID_EMAIL                 the login email
 *   - CIPHERA_SETTINGS_SMOKE_PASSWORD  the login password
 *
 * Neither value is ever logged.
 */

const EMAIL = process.env.CIPHERA_ID_EMAIL
const PASSWORD = process.env.CIPHERA_SETTINGS_SMOKE_PASSWORD

/** True while the browser is sitting on the Ciphera ID origin (login/redirect). */
function onIdOrigin(url: string): boolean {
  return url.includes('id-staging') || url.includes('id.ciphera')
}

export function requireCredentials(): { email: string; password: string } {
  if (!EMAIL || !PASSWORD) {
    throw new Error(
      'Missing credentials: set CIPHERA_ID_EMAIL and CIPHERA_SETTINGS_SMOKE_PASSWORD ' +
        'in the environment before running the authed smoke suite.',
    )
  }
  return { email: EMAIL, password: PASSWORD }
}

/**
 * If the current page is the Ciphera ID login, sign in and wait to return to
 * the app origin. Safe to call repeatedly (no-op when already authed).
 */
export async function handleLogin(page: Page): Promise<void> {
  const { email, password } = requireCredentials()

  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1500)

  if (!onIdOrigin(page.url())) return

  await page.fill('input[placeholder="you@example.com"]', email)
  await page.fill('input[placeholder="Enter your password"]', password)
  await page.click('button:has-text("Sign in")')

  await page.waitForURL((url) => !onIdOrigin(url.toString()), { timeout: 20_000 })
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(2000)
}

/**
 * Establish an authenticated session and return once the browser is back on the
 * app origin.
 *
 * We navigate to a PROTECTED route (`/settings`) rather than `baseURL` itself:
 * on staging the root `/` serves the PUBLIC marketing page and never triggers a
 * login bounce, so a `goto(baseURL)` would be a silent no-op that leaves us
 * unauthenticated. A protected route, while unauthenticated, redirects through
 * Pulse `/login` to the Ciphera ID origin (OPAQUE — the password never reaches
 * Pulse). Deep-linking to `/settings` unauthenticated loses the return target
 * and lands on `/` after login (app bug, ledger item 5-3) — harmless here: we
 * only need the session established, and each test re-navigates to its route
 * with an already-authed goto.
 */
export async function login(page: Page, baseURL: string): Promise<void> {
  await page.goto(`${baseURL}/settings`)

  // Wait to be bounced to the ID origin; if we never leave (already authed, or
  // no redirect), fall through — the guard below re-checks the real URL.
  await page
    .waitForURL((url) => onIdOrigin(url.toString()), { timeout: 30_000 })
    .catch(() => {})

  if (onIdOrigin(page.url())) {
    const { email, password } = requireCredentials()
    await page.fill('input[placeholder="you@example.com"]', email)
    await page.fill('input[placeholder="Enter your password"]', password)
    await page.click('button:has-text("Sign in")')
    await page.waitForURL((url) => !onIdOrigin(url.toString()), { timeout: 30_000 })
  }

  await page.waitForLoadState('networkidle').catch(() => {})
}
