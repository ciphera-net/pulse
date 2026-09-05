import { test, expect, type Cookie, type Page, type BrowserContext, request as playwrightRequest } from '@playwright/test'
import { resolve } from 'node:path'
import { login } from './support/login'

/**
 * S3 soak — Pulse's host-only session, on the deployed staging stack.
 *
 * Design §10.11. What can only be proven in a real browser against the real
 * two-host layout (pulse-staging + pulse-api-staging, both under ciphera.net,
 * NODE_ENV=production so getCookieDomain-era behaviour is faithful):
 *
 *   0. THE GATE, by raw request (no session): a browser holding only the
 *      ceremony's apex cookie is NOT signed in to Pulse — /sites redirects it to
 *      /login — while a browser holding pulse_* passes. This is the middleware
 *      discriminator, and it is what makes "returning apex-only browser" real.
 *   1. A fresh sign-in through the OPAQUE ceremony leaves the browser holding
 *      BOTH the apex trio (the ceremony writes them, Domain=.ciphera.net) AND
 *      Pulse's own pulse_access/pulse_refresh/pulse_csrf — host-only on this
 *      host, httpOnly. NOTHING named pulse_* is ever an apex cookie.
 *   2. Every request to pulse-api carries Authorization: Bearer, and no answer
 *      sets a csrf_token cookie (the third writer is gone).
 *   3. A forced renewal rotates pulse_refresh only; the apex values are
 *      byte-identical before and after — Pulse never touches the ceremony's.
 *   4. A reload keeps the session (the in-memory Bearer is re-primed from the
 *      httpOnly cookie).
 *   5. Sign-out expires pulse_* and leaves the apex trio untouched.
 *
 * 🔴 A fresh login each run, not a cached storageState. Pulse rotates refresh
 * tokens, so a cached state is single-use (tests/cerberus-settings-mocks.spec.ts:67);
 * the ceremony also produces the exact apex+pulse browser this test needs. The
 * account's second factor is answered from CIPHERA_ID_TOTP_SECRET (unattended)
 * or a code written to /tmp/pulse-totp.txt (interactive) — see support/login.ts.
 *
 * Run: SMOKE_BASE_URL=https://pulse-staging.ciphera.net npx playwright test tests/s3-host-only-session.spec.ts
 */

const BASE = process.env.SMOKE_BASE_URL ?? 'https://pulse-staging.ciphera.net'
const HOST = new URL(BASE).hostname
const API_HOST = process.env.SMOKE_API_HOST ?? (HOST === 'pulse.ciphera.net' ? 'pulse-api.ciphera.net' : 'pulse-api-staging.ciphera.net')
const STATE_OUT = resolve(process.env.STAGING_STATE ?? '../docs/data/qa-harness/pulse-authed-state.json')

const PULSE_COOKIES = ['pulse_access', 'pulse_refresh', 'pulse_csrf'] as const
const APEX_COOKIES = ['access_token', 'refresh_token', 'csrf_token'] as const

test.describe.configure({ mode: 'serial' })

function byName(cookies: Cookie[], name: string): Cookie | undefined {
  return cookies.find((c) => c.name === name)
}
/** The apex trio, read only from the `.ciphera.net` (dot-prefixed) domain. */
function apexSnapshot(cookies: Cookie[]): Record<string, string | undefined> {
  return Object.fromEntries(
    APEX_COOKIES.map((n) => [n, cookies.find((c) => c.name === n && c.domain.startsWith('.'))?.value]),
  )
}

let page: Page
let context: BrowserContext

test.beforeAll(async ({ browser }) => {
  context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  page = await context.newPage()
  // A skip on staging is caught by the caller; here a failed login fails the run.
  await login(page, BASE)
  // A fresh browser profile gets the product-tour modal over everything.
  const skip = page.getByRole('button', { name: /skip|got it|dismiss/i }).first()
  if (await skip.isVisible({ timeout: 3_000 }).catch(() => false)) await skip.click()
})

test.afterAll(async () => {
  // Write the rotated state back so a later manual run does not present a spent
  // token (single-use storageState — the reuse-revokes trap).
  await context?.storageState({ path: STATE_OUT }).catch(() => {})
  await context?.close()
})

test('0: the gate discriminates apex-only from a Pulse session, by raw request', async () => {
  const cookies = await context.cookies()
  const apexRefresh = byName(cookies, 'refresh_token')?.value
  const pulseRefresh = byName(cookies, 'pulse_refresh')?.value
  expect(apexRefresh, 'the ceremony must have set an apex refresh_token').toBeTruthy()
  expect(pulseRefresh, 'the exchange must have set pulse_refresh').toBeTruthy()

  // A clean request context carries only the cookie we hand it — no session.
  const apexOnly = await playwrightRequest.newContext({ extraHTTPHeaders: { cookie: `refresh_token=${apexRefresh}` } })
  const withApex = await apexOnly.get(`${BASE}/sites`, { maxRedirects: 0 })
  expect([301, 302, 307, 308], `apex-only cookie must be redirected off /sites, got ${withApex.status()}`).toContain(withApex.status())
  expect(withApex.headers()['location'] ?? '', 'apex-only cookie must be bounced to /login').toContain('/login')
  await apexOnly.dispose()

  const pulseCtx = await playwrightRequest.newContext({ extraHTTPHeaders: { cookie: `pulse_refresh=${pulseRefresh}` } })
  const withPulse = await pulseCtx.get(`${BASE}/sites`, { maxRedirects: 0 })
  expect(withPulse.status(), 'a pulse_refresh cookie must reach /sites (200, not a login bounce)').toBe(200)
  await pulseCtx.dispose()
})

test('1: a signed-in browser holds host-only pulse_* AND the ceremony\'s apex trio, with no pulse_* on the apex', async () => {
  const cookies = await context.cookies()
  for (const n of PULSE_COOKIES) {
    const c = byName(cookies, n)
    expect(c, `${n} must be set`).toBeTruthy()
    expect(c!.domain, `${n} must be host-only on ${HOST}`).toBe(HOST)
    expect(c!.httpOnly, `${n} must be httpOnly`).toBe(true)
    expect(c!.sameSite).toBe('Lax')
  }
  expect(cookies.filter((c) => c.name.startsWith('pulse_') && c.domain.startsWith('.')), 'no pulse_* may be an apex cookie').toHaveLength(0)
  const apex = apexSnapshot(cookies)
  expect(apex.refresh_token, 'the ceremony\'s apex refresh_token must be present').toBeTruthy()
})

test('2: every pulse-api request carries a Bearer, and no answer mints a csrf_token cookie', async () => {
  const requests: { url: string; authorization: string | null }[] = []
  const csrfSetCookies: string[] = []
  const onReq = (req: import('@playwright/test').Request) => {
    const u = new URL(req.url())
    if (u.hostname === API_HOST && req.method() !== 'OPTIONS') requests.push({ url: req.url(), authorization: req.headers()['authorization'] ?? null })
  }
  const onRes = async (res: import('@playwright/test').Response) => {
    if (new URL(res.url()).hostname !== API_HOST) return
    const h = await res.allHeaders().catch(() => ({}) as Record<string, string>)
    if (h['set-cookie'] && /(^|\n)csrf_token=/.test(h['set-cookie'])) csrfSetCookies.push(res.url())
  }
  page.on('request', onReq)
  page.on('response', onRes)

  await page.goto(`${BASE}/sites`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(2_000)
  page.off('request', onReq)
  page.off('response', onRes)

  expect(requests.length, 'the dashboard must call pulse-api').toBeGreaterThan(0)
  const bare = requests.filter((r) => !r.authorization?.startsWith('Bearer '))
  expect(bare, `pulse-api requests without a Bearer: ${JSON.stringify(bare.slice(0, 5))}`).toHaveLength(0)
  expect(csrfSetCookies, 'pulse-api must not mint csrf_token for a Bearer session').toHaveLength(0)
})

test('3: a forced renewal rotates pulse_refresh only; the apex values are byte-identical', async () => {
  const before = await context.cookies()
  const apexBefore = apexSnapshot(before)
  const refreshBefore = byName(before, 'pulse_refresh')?.value

  const status = await page.evaluate(async () => {
    const r = await fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ screen_width: window.screen.width, screen_height: window.screen.height, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
    })
    return r.status
  })
  expect(status, 'the renewal must succeed').toBe(200)

  const after = await context.cookies()
  expect(byName(after, 'pulse_access')?.value, 'a new access cookie').toBeTruthy()
  const refreshAfter = byName(after, 'pulse_refresh')?.value
  expect(refreshAfter).toBeTruthy()
  test.info().annotations.push({ type: 'rotation', description: refreshAfter === refreshBefore ? 'renew-only (echo path)' : 'rotated' })
  expect(apexSnapshot(after), 'Pulse\'s renewal must not touch the apex cookies').toEqual(apexBefore)
})

test('4: a reload keeps the session — the Bearer is re-primed from the httpOnly cookie', async () => {
  const authed: string[] = []
  const onReq = (req: import('@playwright/test').Request) => {
    const u = new URL(req.url())
    if (u.hostname === API_HOST && req.headers()['authorization']?.startsWith('Bearer ')) authed.push(req.url())
  }
  page.on('request', onReq)
  await page.reload()
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1_500)
  page.off('request', onReq)
  await expect(page.getByRole('button', { name: /sign back in|sign in to continue/i })).toHaveCount(0)
  expect(authed.length, 'after the reload the dashboard must still call pulse-api with a Bearer').toBeGreaterThan(0)
})

test('5: signing out expires pulse_* and leaves the apex trio untouched', async () => {
  const apexBefore = apexSnapshot(await context.cookies())

  // Facet's UserMenu: a trigger opens it, the item reads "Logout".
  const trigger = page.getByRole('button', { name: /usman|account|user menu|open menu|profile/i }).first()
  if (await trigger.isVisible({ timeout: 8_000 }).catch(() => false)) {
    await trigger.click()
  }
  await page.getByRole('menuitem', { name: /logout|sign out/i }).first().click()
  await page.waitForURL((u) => u.pathname.startsWith('/login') || u.pathname === '/', { timeout: 30_000 })

  const after = await context.cookies()
  for (const n of PULSE_COOKIES) expect(byName(after, n), `${n} must be gone after sign-out`).toBeUndefined()
  expect(apexSnapshot(after), 'sign-out is Pulse-only: the ceremony\'s apex cookies stay').toEqual(apexBefore)
})
