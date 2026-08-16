import { test, expect, type Page, type BrowserContext } from '@playwright/test'

/**
 * Acceptance test for the OAuth `state` clobbering fix.
 *
 * Before the fix, every sign-in attempt wrote to ONE localStorage slot
 * (`oauth_state` / `oauth_code_verifier`) shared by every tab. Starting a second
 * attempt overwrote the first, so completing the earlier authorization failed
 * state validation and the callback rendered "Invalid state".
 *
 * The clobber case below reproduces exactly that, and must pass once each
 * attempt is stored under its own `oauth_pending:<state>` entry.
 *
 * Credentials come ONLY from the environment and are never logged:
 *   CIPHERA_ID_EMAIL     the login email
 *   CIPHERA_ID_PASSWORD  the login password
 *
 * Run against a specific deployment with SMOKE_BASE_URL, e.g.
 *   SMOKE_BASE_URL=https://pulse-staging.ciphera.net npx playwright test tests/oauth-state-clobber.spec.ts
 */

const EMAIL = process.env.CIPHERA_ID_EMAIL
const PASSWORD = process.env.CIPHERA_ID_PASSWORD

function credentials(): { email: string; password: string } {
  if (!EMAIL || !PASSWORD) {
    throw new Error(
      'Missing credentials: set CIPHERA_ID_EMAIL and CIPHERA_ID_PASSWORD in the environment.',
    )
  }
  return { email: EMAIL, password: PASSWORD }
}

function onIdOrigin(url: string): boolean {
  return url.includes('id-staging') || url.includes('id.ciphera')
}

/** Fill and submit the Ciphera ID login form on whichever ID page we are on. */
async function signInOnId(page: Page): Promise<void> {
  const { email, password } = credentials()

  // * The account chooser appears when an ID session already exists
  // * (prompt=select_account). Take the "use another account" path so the form
  // * is always what we fill.
  const useAnother = page.locator('button:has-text("Use another account"), a:has-text("Use another account")')
  if (await useAnother.count()) {
    await useAnother.first().click()
  }

  const emailField = page.locator('#email, input[placeholder="you@example.com"]').first()
  const passwordField = page.locator('#password, input[placeholder="Enter your password"]').first()

  await emailField.waitFor({ state: 'visible', timeout: 30_000 })
  await emailField.fill(email)
  await passwordField.fill(password)
  await page.locator('button:has-text("Sign in")').first().click()
}

/**
 * Start a sign-in and return the authorization URL it minted, without
 * completing it. The `state` in that URL identifies this attempt.
 */
async function mintAuthorizationUrl(page: Page): Promise<string> {
  await page.goto('/login')
  await page.waitForURL((url) => onIdOrigin(url.toString()), { timeout: 30_000 })
  const url = page.url()
  expect(url, 'the authorization URL must carry a state parameter').toContain('state=')
  return url
}

function stateOf(authorizationUrl: string): string {
  const state = new URL(authorizationUrl).searchParams.get('state')
  expect(state, 'authorization URL must carry a state').toBeTruthy()
  return state as string
}

/** A context with no prior Pulse or ID session. */
async function freshPage(context: BrowserContext): Promise<Page> {
  await context.clearCookies()
  return context.newPage()
}

test.describe('OAuth state handling', () => {
  test('control: a plain sign-in completes and lands on the site list', async ({ browser }) => {
    const context = await browser.newContext()
    const page = await freshPage(context)

    await page.goto('/login')
    await page.waitForURL((url) => onIdOrigin(url.toString()), { timeout: 30_000 })
    await signInOnId(page)

    await page.waitForURL((url) => !onIdOrigin(url.toString()), { timeout: 45_000 })
    await expect(page).toHaveURL(/\/sites/, { timeout: 45_000 })

    await context.close()
  })

  test('clobber: completing a superseded authorization still signs in', async ({ browser }) => {
    const context = await browser.newContext()
    const page = await freshPage(context)

    // * Attempt A — started, not completed.
    const urlA = await mintAuthorizationUrl(page)

    // * Attempt B — the second /login mount. Before the fix this overwrote A's
    // * stored state and verifier, orphaning A.
    //
    // * Deliberately no other Pulse page in between: the old route-based storage
    // * cleanup wiped the keys on any non-callback path, which made the callback
    // * skip validation entirely and hid the bug.
    const urlB = await mintAuthorizationUrl(page)
    expect(stateOf(urlA), 'the two attempts must be distinct').not.toBe(stateOf(urlB))

    // * Now finish the EARLIER authorization.
    await page.goto(urlA)
    await signInOnId(page)

    await page.waitForURL((url) => !onIdOrigin(url.toString()), { timeout: 45_000 })

    // * The old failure: the callback rendered the raw string "Invalid state".
    await expect(page.locator('body')).not.toContainText('Invalid state')
    await expect(page).toHaveURL(/\/sites/, { timeout: 45_000 })

    await context.close()
  })

  test('negative control: an unknown state is still rejected', async ({ browser }) => {
    const context = await browser.newContext()
    const page = await freshPage(context)

    // * Start a real attempt so a valid pending entry exists — a forged state
    // * must not be able to borrow it.
    await mintAuthorizationUrl(page)

    await page.goto('/auth/callback?code=forged-code&state=forged-state-not-issued-by-this-client')

    // * Must land on the error surface, not sign anybody in. The check being
    // * present is the point: removing validation would make this pass silently.
    //
    // * Scope the alert by its heading — Next's route announcer is also
    // * role="alert", so a bare getByRole('alert') is a strict-mode violation.
    const surface = page.getByRole('alert').filter({ hasText: 'sign-in' })
    await expect(surface).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('button', { name: 'Start sign-in again' })).toBeVisible()
    await expect(page).not.toHaveURL(/\/sites/)

    // * And the copy is human, not a developer string.
    await expect(page.locator('body')).not.toContainText('Invalid state')

    await context.close()
  })
})
