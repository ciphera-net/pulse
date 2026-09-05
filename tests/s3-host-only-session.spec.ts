import { test, expect, type Cookie, type Page } from '@playwright/test'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * S3 soak — Pulse's host-only session, exercised by a RETURNING browser.
 *
 * Design §10.9 says why this cannot be a unit test: it is cookie-jar behaviour.
 * The browser that matters is one that already holds the ceremony's apex
 * cookies from before S3, not a fresh profile — a first-time login passes
 * either way and proves nothing. The cached storageState below is exactly that
 * browser: the owner's real ID-origin session, minted 01-09, with the apex
 * `refresh_token` / `csrf_token` on `.ciphera.net` and no `pulse_*` at all.
 *
 * What it proves, in order:
 *   1. a returning browser with only the apex cookies is NOT signed in to Pulse
 *      any more — it gets the gate, and the OAuth hop passes it straight through
 *      id.ciphera.net without a ceremony (the apex session is what SSO is);
 *   2. after the hop the browser holds pulse_access / pulse_refresh / pulse_csrf,
 *      host-only on THIS host, httpOnly, and NOTHING named pulse_* on the apex;
 *   3. every request to pulse-api carries `Authorization: Bearer`, and no
 *      pulse-api answer sets a csrf_token cookie (the third writer is gone);
 *   4. a forced renewal rotates pulse_refresh only — the apex values are
 *      byte-identical before and after;
 *   5. a reload keeps the session (the in-memory Bearer is re-primed from the
 *      httpOnly cookie);
 *   6. signing out expires pulse_* and leaves the apex trio untouched.
 *
 * 🔴 THE STATE FILE IS WRITTEN BACK AFTER EVERY TEST. Pulse rotates refresh
 * tokens; a run that does not write back leaves the file holding a spent token,
 * and the NEXT run presents it — that is reuse, and reuse revokes the family
 * (tests/cerberus-settings-mocks.spec.ts:67 has the incident).
 *
 * Run: SMOKE_BASE_URL=https://pulse-staging.ciphera.net npx playwright test tests/s3-host-only-session.spec.ts
 */

const BASE = process.env.SMOKE_BASE_URL ?? 'https://pulse-staging.ciphera.net'
const HOST = new URL(BASE).hostname
const API_HOST = process.env.SMOKE_API_HOST ?? (HOST === 'pulse.ciphera.net' ? 'pulse-api.ciphera.net' : 'pulse-api-staging.ciphera.net')
const STATE = resolve(process.env.STAGING_STATE ?? '../docs/data/qa-harness/pulse-authed-state.json')

const PULSE_COOKIES = ['pulse_access', 'pulse_refresh', 'pulse_csrf'] as const
const APEX_COOKIES = ['access_token', 'refresh_token', 'csrf_token'] as const

test.describe.configure({ mode: 'serial' })
test.use({ storageState: STATE })

test.beforeAll(() => {
  if (!existsSync(STATE)) throw new Error(`no cached session at ${STATE} — mint one first (tests/support/login.ts)`)
})

// Every test writes the jar back: rotated tokens must never be left behind.
test.afterEach(async ({ context }) => {
  await context.storageState({ path: STATE })
})

function byName(cookies: Cookie[], name: string): Cookie | undefined {
  return cookies.find((c) => c.name === name)
}
function apexSnapshot(cookies: Cookie[]): Record<string, string | undefined> {
  return Object.fromEntries(APEX_COOKIES.map((n) => [n, cookies.find((c) => c.name === n && c.domain.endsWith('ciphera.net') && c.domain.startsWith('.'))?.value]))
}

/** Records pulse-api traffic so the Bearer and the absence of csrf cookies can be asserted. */
function watchApi(page: Page) {
  const requests: { url: string; method: string; authorization: string | null }[] = []
  const csrfSetCookies: string[] = []
  page.on('request', (req) => {
    const u = new URL(req.url())
    if (u.hostname !== API_HOST || req.method() === 'OPTIONS') return
    requests.push({ url: req.url(), method: req.method(), authorization: req.headers()['authorization'] ?? null })
  })
  page.on('response', async (res) => {
    const u = new URL(res.url())
    if (u.hostname !== API_HOST) return
    const headers = await res.allHeaders().catch(() => ({}) as Record<string, string>)
    const sc = headers['set-cookie']
    if (sc && /(^|\n)csrf_token=/.test(sc)) csrfSetCookies.push(res.url())
  })
  return { requests, csrfSetCookies }
}

async function signInThroughTheGate(page: Page) {
  // A returning apex-only browser lands on the gate; the button starts the OAuth hop.
  const gateButton = page.getByRole('button', { name: /sign back in|sign in to continue|sign in instead/i }).first()
  await expect(gateButton, 'the returning browser must be gated, not silently signed in on the apex cookie').toBeVisible({ timeout: 20_000 })
  await gateButton.click()
  // Through id.ciphera.net and back. If the ceremony FORM appears here the apex
  // session in the state file has died and the soak cannot continue unattended.
  await page.waitForURL((u) => u.hostname.includes('id') && u.hostname.endsWith('ciphera.net'), { timeout: 30_000 })
  const form = page.locator('input[placeholder="you@example.com"]')
  if (await form.isVisible({ timeout: 3_000 }).catch(() => false)) {
    throw new Error('id.ciphera.net asked for the ceremony: the cached apex session is no longer valid — re-mint the state file')
  }
  await page.waitForURL((u) => u.hostname === HOST && !u.pathname.startsWith('/login') && !u.pathname.startsWith('/auth/'), { timeout: 60_000 })
}

test('1+2: a returning apex-only browser is gated, passes through, and gets host-only pulse_* cookies', async ({ page, context }) => {
  const before = await context.cookies()
  const apexBefore = apexSnapshot(before)
  expect(apexBefore.refresh_token, 'the state file must hold the apex refresh_token — that is the returning session').toBeTruthy()
  for (const n of PULSE_COOKIES) expect(byName(before, n), `${n} must be absent before the hop`).toBeUndefined()

  await page.goto(`${BASE}/sites`)
  await signInThroughTheGate(page)

  const after = await context.cookies()
  for (const n of PULSE_COOKIES) {
    const c = byName(after, n)
    expect(c, `${n} must be set after the hop`).toBeTruthy()
    expect(c!.domain, `${n} must be host-only on ${HOST}`).toBe(HOST)
    expect(c!.httpOnly, `${n} must be httpOnly`).toBe(true)
    expect(c!.sameSite).toBe('Lax')
  }
  const apexPulse = after.filter((c) => c.name.startsWith('pulse_') && c.domain.startsWith('.'))
  expect(apexPulse, 'no pulse_* cookie may ever be an apex cookie').toHaveLength(0)
  // The apex trio is the ceremony's. id-frontend may have ROTATED its own
  // refresh token during the hop (its client refreshes on a 401); what must not
  // have happened is a delete: the ceremony's session survives Pulse's login.
  const apexAfter = apexSnapshot(after)
  expect(apexAfter.refresh_token, 'the ceremony\'s apex refresh_token must survive Pulse\'s login').toBeTruthy()
})

test('3: every pulse-api request carries a Bearer, and no answer mints a csrf_token cookie', async ({ page }) => {
  const watch = watchApi(page)
  await page.goto(`${BASE}/sites`)
  await page.waitForLoadState('networkidle')
  // Give SWR a moment to fan out.
  await page.waitForTimeout(2_000)

  expect(watch.requests.length, 'the dashboard must have called pulse-api').toBeGreaterThan(0)
  const bare = watch.requests.filter((r) => !r.authorization || !r.authorization.startsWith('Bearer '))
  expect(bare, `pulse-api requests without a Bearer: ${JSON.stringify(bare.slice(0, 5))}`).toHaveLength(0)
  expect(watch.csrfSetCookies, 'pulse-api must not mint csrf_token for a Bearer session').toHaveLength(0)
})

test('4: a forced renewal rotates pulse_refresh only; the apex values are byte-identical', async ({ page, context }) => {
  await page.goto(`${BASE}/sites`)
  await page.waitForLoadState('networkidle')
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
  // Rotated (normal) or renew-only (a concurrent tab won): either way, ours.
  test.info().annotations.push({ type: 'rotation', description: refreshAfter === refreshBefore ? 'renew-only (echo path)' : 'rotated' })
  expect(apexSnapshot(after), 'Pulse\'s renewal must not touch the apex cookies').toEqual(apexBefore)
})

test('5: a reload keeps the session — the Bearer is re-primed from the httpOnly cookie', async ({ page }) => {
  const watch = watchApi(page)
  await page.goto(`${BASE}/sites`)
  await page.waitForLoadState('networkidle')
  await page.reload()
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1_500)
  await expect(page.getByRole('button', { name: /sign back in|sign in to continue/i })).toHaveCount(0)
  const afterReload = watch.requests.filter((r) => r.authorization?.startsWith('Bearer '))
  expect(afterReload.length, 'after the reload the dashboard must still call pulse-api with a Bearer').toBeGreaterThan(0)
})

test('6: signing out expires pulse_* and leaves the apex trio untouched', async ({ page, context }) => {
  await page.goto(`${BASE}/sites`)
  await page.waitForLoadState('networkidle')
  const before = await context.cookies()
  const apexBefore = apexSnapshot(before)

  // Facet's UserMenu: the trigger carries the account, the item reads "Logout".
  const trigger = page.getByRole('button', { name: /usman|account|user menu|open menu/i }).first()
  await expect(trigger, 'the user menu trigger (adjust the selector if Facet renamed it)').toBeVisible({ timeout: 15_000 })
  await trigger.click()
  await page.getByRole('menuitem', { name: /logout|sign out/i }).first().click()
  await page.waitForURL((u) => u.pathname.startsWith('/login') || u.pathname === '/', { timeout: 30_000 })

  const after = await context.cookies()
  for (const n of PULSE_COOKIES) expect(byName(after, n), `${n} must be gone after sign-out`).toBeUndefined()
  expect(apexSnapshot(after), 'sign-out is Pulse-only: the ceremony\'s apex cookies stay').toEqual(apexBefore)
})
