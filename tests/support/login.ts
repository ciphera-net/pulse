import type { Page } from '@playwright/test'
import { createHmac } from 'node:crypto'
import { existsSync, readFileSync, statSync, unlinkSync } from 'node:fs'

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
// Accept either name. The workspace .env ships CIPHERA_ID_PASSWORD, and every
// run of this suite used to fail on a variable nobody had.
const PASSWORD =
  process.env.CIPHERA_SETTINGS_SMOKE_PASSWORD ?? process.env.CIPHERA_ID_PASSWORD

/**
 * Base32 secret for the account's authenticator, if it has one.
 *
 * 🔴 Ciphera ID enforces a second factor on this account, and this helper had
 * no step for it — so EVERY authed spec in this repo was failing at the
 * six-digit prompt, not at whatever it meant to test. Set this and the suite
 * runs unattended; leave it unset and an interactive run can drop a code in
 * TOTP_FILE instead.
 */
const TOTP_SECRET = process.env.CIPHERA_ID_TOTP_SECRET
const TOTP_FILE = process.env.CIPHERA_ID_TOTP_FILE ?? '/tmp/pulse-totp.txt'

/**
 * How long an interactive run waits for a pasted code.
 *
 * 🔴 WIDENED FROM 450 s TO 20 MIN ON 30-08-2026, after two consecutive runs
 * timed out for the same reason: the window assumed someone already watching
 * the terminal. They usually are not — they are asked for a code, go and open
 * an authenticator, and by then the run has given up and burned a login
 * attempt. 450 s is a fine budget for a machine and a poor one for a person.
 *
 * Cost, stated: an interactive run that nobody answers now hangs for 20 minutes
 * instead of 7½. That is the correct trade — an abandoned run costs idle time,
 * whereas one that gives up too early costs a real login attempt AND the
 * operator's second trip to their phone. Unattended runs are unaffected: they
 * set CIPHERA_ID_TOTP_SECRET and never reach this loop.
 *
 * Override with CIPHERA_ID_TOTP_WAIT_SECONDS where a fast fail is wanted (CI, or
 * a scripted run that must not block).
 */
const TOTP_WAIT_MS = Number(process.env.CIPHERA_ID_TOTP_WAIT_SECONDS ?? 1200) * 1000

/** True while the browser is sitting on the Ciphera ID origin (login/redirect). */
function onIdOrigin(url: string): boolean {
  return url.includes('id-staging') || url.includes('id.ciphera')
}

export function requireCredentials(): { email: string; password: string } {
  if (!EMAIL || !PASSWORD) {
    throw new Error(
      'Missing credentials: set CIPHERA_ID_EMAIL and CIPHERA_SETTINGS_SMOKE_PASSWORD ' +
        '(or CIPHERA_ID_PASSWORD) before running the authed smoke suite.',
    )
  }
  return { email: EMAIL, password: PASSWORD }
}


/** RFC 4648 base32 -> bytes. Authenticator secrets are base32, often padded. */
function base32Decode(input: string): Buffer {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const clean = input.replace(/=+$/, '').replace(/\s+/g, '').toUpperCase()
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const ch of clean) {
    const idx = A.indexOf(ch)
    if (idx === -1) throw new Error(`CIPHERA_ID_TOTP_SECRET is not valid base32 (bad char ${ch})`)
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return Buffer.from(out)
}

/**
 * RFC 6238 TOTP — SHA-1, 6 digits, 30s step, which is what authenticator apps
 * and id-backend both assume. Implemented here rather than pulled in as a
 * dependency: it is twenty lines and this is a test helper.
 */
export function totpCode(secret: string, at: number = Date.now()): string {
  const counter = Math.floor(at / 1000 / 30)
  const msg = Buffer.alloc(8)
  msg.writeUInt32BE(Math.floor(counter / 2 ** 32), 0)
  msg.writeUInt32BE(counter >>> 0, 4)
  const digest = createHmac('sha1', base32Decode(secret)).update(msg).digest()
  const offset = digest[digest.length - 1] & 0x0f
  const bin =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff)
  return String(bin % 1_000_000).padStart(6, '0')
}

/**
 * A six-digit code, from the secret if we have one, otherwise from a file a
 * human drops in.
 *
 * The file path deliberately does NOT clear on entry and accepts anything
 * written in the last two minutes: a person will often paste the code before
 * the browser reaches the prompt, and deleting it here would throw away the one
 * thing we are waiting for. A stale code from an earlier run is refused instead
 * of being replayed into a confusing login failure.
 */
async function secondFactorCode(page: Page): Promise<string> {
  if (TOTP_SECRET) return totpCode(TOTP_SECRET)

  // eslint-disable-next-line no-console
  console.log(
    `\n>>> Ciphera ID wants a 6-digit code. Write one to ${TOTP_FILE} ` +
      `(waiting up to ${Math.round(TOTP_WAIT_MS / 60_000)} min) <<<\n`,
  )
  const ticks = Math.ceil(TOTP_WAIT_MS / 500)
  for (let i = 0; i < ticks; i++) {
    if (existsSync(TOTP_FILE)) {
      const code = readFileSync(TOTP_FILE, 'utf8').trim()
      const fresh = Date.now() - statSync(TOTP_FILE).mtimeMs < 120_000
      if (/^\d{6}$/.test(code) && fresh) {
        unlinkSync(TOTP_FILE)
        return code
      }
    }
    await page.waitForTimeout(500)
  }
  throw new Error(
    'Ciphera ID asked for a second factor and none arrived. Set ' +
      'CIPHERA_ID_TOTP_SECRET for unattended runs, or write a fresh code to ' +
      TOTP_FILE,
  )
}

/**
 * Answers the six-digit prompt if id-backend raises one. No-op otherwise, so
 * it is safe on an account without a second factor.
 */
async function handleSecondFactor(page: Page): Promise<void> {
  const otp = page.locator('input[placeholder="6-digit code"]')
  await otp.waitFor({ state: 'visible', timeout: 8_000 }).catch(() => {})
  if ((await otp.count()) === 0) return
  await otp.fill(await secondFactorCode(page))
  await page.click('button:has-text("Verify code")')
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
  await handleSecondFactor(page)

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
/**
 * Answers Ciphera ID's account chooser when `prompt=select_account` finds an
 * existing apex session.
 *
 * 🔴 WITHOUT THIS, AN ALREADY-SIGNED-IN RUN HANGS AND LOOKS LIKE A BROKEN APP.
 * The authorize URL Pulse builds carries `prompt=select_account`, so a browser
 * that already holds the ceremony's `.ciphera.net` session is NOT redirected
 * back — id.ciphera.net renders "Continue as <email>" and waits for a click
 * that no harness ever made. Measured 05-09-2026: the run sat on the chooser,
 * never received a code, and the absence of a code read as "the exchange
 * failed" (design §10.11.4).
 */
async function passThroughAccountChooser(page: Page): Promise<boolean> {
  const cont = page.getByRole('button', { name: /^Continue as/ }).first()
  if (!(await cont.isVisible({ timeout: 5_000 }).catch(() => false))) return false
  await cont.click()
  return true
}

export async function login(page: Page, baseURL: string): Promise<void> {
  await page.goto(`${baseURL}/settings`)

  // Wait to be bounced to the ID origin; if we never leave (already authed, or
  // no redirect), fall through — the guard below re-checks the real URL.
  await page
    .waitForURL((url) => onIdOrigin(url.toString()), { timeout: 30_000 })
    .catch(() => {})

  if (onIdOrigin(page.url())) {
    // * An existing apex session lands on the account chooser, not the form.
    // * Clicking through it is a complete sign-in and costs no second factor.
    if (!(await passThroughAccountChooser(page))) {
      const { email, password } = requireCredentials()
      await page.fill('input[placeholder="you@example.com"]', email)
      await page.fill('input[placeholder="Enter your password"]', password)
      await page.click('button:has-text("Sign in")')
      await handleSecondFactor(page)
    }
    await page.waitForURL((url) => !onIdOrigin(url.toString()), { timeout: 60_000 })
  }

  await page.waitForLoadState('networkidle').catch(() => {})
}
