import { existsSync, readFileSync } from 'node:fs'
import { test, expect, type Page } from '@playwright/test'

/**
 * Visitors surface — the 30-08-2026 AUDIT walkthrough.
 *
 * Exercises the states the shipped walkthrough never reached: the presence
 * field against a population bigger than a page, a visit longer than one trail
 * page, deep roster pagination, a second page of visits, a Cerberus-convicted
 * session beside a clean one, a site whose collection settings were NARROWED
 * after collection, real realtime-tracker membership, the 404 and 400 paths,
 * the error card, the empty range, the keyboard shortcut, the InfoTips, three
 * viewport widths, and a viewer whose timezone is not the site's.
 *
 * 🔴 EVERY TEST RUNS OFF A CACHED SESSION. Logging in costs a person a trip to
 * an authenticator; tests/visitors-audit-login.spec.ts pays that once.
 *
 * Fixtures are seeded by scratchpad/seed-audit-fixtures.sql on pulse_staging,
 * which has been a separate database since 17-07-2026.
 */

const BASE = process.env.SMOKE_BASE_URL ?? 'https://pulse-staging.ciphera.net'
const STATE = process.env.VISITORS_STORAGE_STATE ?? ''
const SHOTS = process.env.VISITORS_SHOT_DIR ?? '/tmp/visitors-audit'

const SCALE = '22222222-2222-4333-8444-555555555555' // 423 visitors, all toggles on
const NARROW = '33333333-2222-4333-8444-555555555555' // geo=country, no referrers, no paths
const OFF = '11111111-2222-4333-8444-555555555555' // toggle off
const DRIVE = 'd5ed7856-3df7-4436-a137-3cada74c30f2' // the original 31-visitor fixture

const TRAIL_VISITOR = 'bd9186d41c629349afc469c46ac13083' // ONE visit, 242 events
const MANY_VISITS = 'ce3e68e3e9f10896339f38dbe5e34be7' // 25 visits
const CERBERUS = 'a43a871b2acebfef7c2b19355a224116' // 1 clean + 1 convicted session

test.use({ viewport: { width: 1440, height: 1000 } })

test.beforeEach(async ({ page }) => {
  if (!STATE || !existsSync(STATE)) throw new Error('No cached session: run visitors-audit-login first')
  await page.context().addCookies(JSON.parse(readFileSync(STATE, 'utf8')).cookies ?? [])
})

/** Waits for the roster to have finished its first fetch. */
async function rosterReady(page: Page) {
  await expect(page.getByRole('heading', { name: 'Visitors', level: 1 })).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('a[href*="/visitors/"]').first()).toBeVisible({ timeout: 30_000 })
}

const dots = (page: Page) => page.locator('div.absolute.-translate-y-1\\/2')

// ════════════════════════════════════════════════════════════════════
test('1 · the presence field draws the RANGE, not one page', async ({ page }) => {
  test.setTimeout(180_000)
  await page.goto(`${BASE}/sites/${SCALE}/visitors?period=30`)
  await rosterReady(page)

  // The roster's own chip states the population the field claims to draw.
  const chip = await page.locator('span.bg-brand-orange\\/10').first().innerText()
  const total = Number(chip.match(/(\d+)/)?.[1] ?? 0)
  const rows = await page.locator('a[href*="/visitors/"]').count()
  const drawn = await dots(page).count()

  // eslint-disable-next-line no-console
  console.log(`FIELD: total-in-range=${total}  rows-on-page=${rows}  dots-drawn=${drawn}`)
  await page.screenshot({ path: `${SHOTS}/1-presence-field-scale.png` })

  // The component's contract: "Every visitor in range is a dot", capped at the
  // 200 most recent, with a "+N more not drawn" note past the cap.
  expect(drawn, `field drew ${drawn} dots for a range of ${total} visitors`).toBe(Math.min(total, 200))
  if (total > 200) {
    await expect(page.getByText(`+${total - 200} more not drawn`)).toBeVisible()
  }
  // And it must not be merely the page.
  expect(drawn, 'field is drawing one page, not the range').toBeGreaterThan(rows)
})

// ════════════════════════════════════════════════════════════════════
test('2 · "Load more" on a 242-step trail APPENDS, it does not replace', async ({ page }) => {
  test.setTimeout(240_000)
  await page.goto(`${BASE}/sites/${SCALE}/visitors/${TRAIL_VISITOR}?period=30`)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 30_000 })

  const toggle = page.locator('button[aria-expanded]').filter({ hasText: /\d+ pages?\s·/ }).first()
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')

  const steps = page.locator('div.pb-3.pl-12 > div')
  await expect(steps.first()).toBeVisible({ timeout: 30_000 })
  const firstPage = await steps.count()
  const headText = await steps.first().innerText()
  // eslint-disable-next-line no-console
  console.log(`TRAIL page 1: ${firstPage} steps, head = ${headText.replace(/\n/g, ' | ').slice(0, 80)}`)
  await page.screenshot({ path: `${SHOTS}/2a-trail-page1.png`, fullPage: true })

  const loadMore = page.getByRole('button', { name: 'Load more' })
  await expect(loadMore, 'a 242-event visit must offer a second page').toBeVisible()
  await loadMore.click()
  await expect(loadMore).toBeHidden({ timeout: 30_000 })

  const afterCount = await steps.count()
  const afterHead = await steps.first().innerText()
  // eslint-disable-next-line no-console
  console.log(`TRAIL after Load more: ${afterCount} steps, head = ${afterHead.replace(/\n/g, ' | ').slice(0, 80)}`)
  await page.screenshot({ path: `${SHOTS}/2b-trail-after-load-more.png`, fullPage: true })

  // 🔴 THE ASSERTION THAT MATTERS. "Load more" must ADD steps. If the second
  // page REPLACES the first, the count drops and the head changes — a trail
  // that looks complete while its beginning is gone, which is the exact
  // failure the component's own comment says must never ship.
  expect(afterCount, 'Load more replaced the trail instead of appending').toBeGreaterThan(firstPage)
  expect(afterHead, 'the first step of the visit disappeared after Load more').toBe(headText)
})

// ════════════════════════════════════════════════════════════════════
test('3 · deep roster pagination and a second page of visits', async ({ page }) => {
  test.setTimeout(240_000)
  await page.goto(`${BASE}/sites/${SCALE}/visitors?period=30`)
  await rosterReady(page)

  const next = page.getByRole('button', { name: /next/i }).first()
  const prev = page.getByRole('button', { name: /previous/i }).first()
  await expect(prev, 'Previous must be disabled on page 1').toBeDisabled()

  for (let i = 0; i < 39; i++) await next.click()
  await expect(page.locator('a[href*="/visitors/"]').first()).toBeVisible({ timeout: 30_000 })
  const label = await page.locator('text=/\\d+[–-]\\d+ of \\d+/').first().innerText()
  // eslint-disable-next-line no-console
  console.log(`ROSTER page 40 label: ${label}`)
  expect(label, 'page 40 of 10-row pages must start at row 391').toMatch(/^391/)
  await page.screenshot({ path: `${SHOTS}/3a-roster-page40.png` })

  // A visitor with 25 visits: the visits list pages at 20.
  await page.goto(`${BASE}/sites/${SCALE}/visitors/${MANY_VISITS}?period=30`)
  await expect(page.getByText('newest first')).toBeVisible({ timeout: 30_000 })
  const visitRows = page.locator('button[aria-expanded]').filter({ hasText: /\d+ pages?\s·/ })
  await expect(visitRows.first()).toBeVisible()
  expect(await visitRows.count(), 'first page of visits').toBe(20)
  const firstVisitLabel = await visitRows.first().innerText()

  await page.getByRole('button', { name: /next/i }).first().click()
  // ⚠️ WAIT FOR THE CONTENT TO CHANGE, not for a row to be visible. The hook
  // sets keepPreviousData, so page 1's twenty rows stay on screen while page 2
  // is in flight — "visible" is true the whole time and a count taken here
  // reads 20 and reports a product bug that does not exist. (It did, once.)
  await expect
    .poll(async () => visitRows.first().innerText(), { timeout: 30_000 })
    .not.toBe(firstVisitLabel)
  const secondCount = await visitRows.count()
  // eslint-disable-next-line no-console
  console.log(`VISITS page 2: ${secondCount} rows (expect 5)`)
  expect(secondCount).toBe(5)
  expect(await visitRows.first().innerText(), 'page 2 shows the same rows as page 1').not.toBe(firstVisitLabel)
  await page.screenshot({ path: `${SHOTS}/3b-visits-page2.png`, fullPage: true })

  // The month ribbon is built from the visits the page has. On page 2 it can
  // therefore only know about 5 of 25 — capture it for the record.
  await page.screenshot({ path: `${SHOTS}/3c-ribbon-on-visits-page2.png` })
})

// ════════════════════════════════════════════════════════════════════
test('4 · Cerberus-convicted and excluded rows are invisible everywhere', async ({ page }) => {
  test.setTimeout(180_000)
  await page.goto(`${BASE}/sites/${SCALE}/visitors/${CERBERUS}?period=30`)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 30_000 })

  // POSITIVE CONTROL FIRST. Without it, "the convicted path is absent" passes
  // on a blank page — the negative test that means nothing without its
  // positive. The visitor must be PRESENT, with the clean session's numbers.
  // .first() — the path appears twice on a visit row (entry → exit).
  await expect(page.getByText('/clean-1').first()).toBeVisible({ timeout: 30_000 })
  const stats = await page.locator('p.mt-3.text-sm').first().innerText()
  // eslint-disable-next-line no-console
  console.log(`CERBERUS visitor stats: ${stats.replace(/\n/g, ' ')}`)
  expect(stats, 'convicted pageviews leaked into the totals').toContain('4 pages')

  const body = await page.locator('body').innerText()
  expect(body, 'a Cerberus-convicted path rendered').not.toContain('CONVICTED')
  expect(body, 'an excluded path rendered').not.toContain('EXCLUDED')

  // And through the trail, which is a different query.
  const toggle = page.locator('button[aria-expanded]').filter({ hasText: /\d+ pages?\s·/ }).first()
  await toggle.click()
  await expect(page.locator('div.pb-3.pl-12 > div').first()).toBeVisible({ timeout: 30_000 })
  const afterTrail = await page.locator('body').innerText()
  expect(afterTrail).not.toContain('CONVICTED')
  expect(afterTrail).not.toContain('EXCLUDED')
  await page.screenshot({ path: `${SHOTS}/4-cerberus-visitor.png`, fullPage: true })
})

// ════════════════════════════════════════════════════════════════════
test('5 · a NARROWED site shows nothing its settings no longer collect', async ({ page }) => {
  test.setTimeout(180_000)
  // collect_geo_data='country', collect_referrers=false, collect_page_paths=false,
  // collect_screen_resolution=false, collect_audience_data=false — but the rows
  // still carry city, referrer and real paths from before the narrowing.
  await page.goto(`${BASE}/sites/${NARROW}/visitors?period=30`)
  await rosterReady(page)
  const roster = await page.locator('body').innerText()
  await page.screenshot({ path: `${SHOTS}/5a-narrow-roster.png` })

  expect(roster, 'city rendered on a country-only site').not.toContain('SECRET-CITY')
  expect(roster, 'region rendered on a country-only site').not.toContain('SECRET-REGION')
  expect(roster, 'referrer rendered with collect_referrers=false').not.toContain('SECRET-QUERY')
  expect(roster, 'page path rendered with collect_page_paths=false').not.toContain('SECRET-PATH')

  // Now one click deeper — the visits list and the trail are different handlers.
  await page.locator('a[href*="/visitors/"]').first().click()
  await page.waitForURL(/\/visitors\/[0-9a-f]{32}/)
  await expect(page.getByText('newest first')).toBeVisible({ timeout: 30_000 })
  const detail = await page.locator('body').innerText()
  await page.screenshot({ path: `${SHOTS}/5b-narrow-detail.png`, fullPage: true })
  expect(detail, 'the visits list leaked a page path the site does not collect').not.toContain('SECRET-PATH')
  expect(detail, 'the detail page leaked a city').not.toContain('SECRET-CITY')
  expect(detail, 'the detail page leaked a referrer').not.toContain('SECRET-QUERY')

  const toggle = page.locator('button[aria-expanded]').filter({ hasText: /\d+ pages?\s·/ }).first()
  await toggle.click()
  await expect(page.locator('div.pb-3.pl-12 > div').first()).toBeVisible({ timeout: 30_000 })
  const trail = await page.locator('body').innerText()
  await page.screenshot({ path: `${SHOTS}/5c-narrow-trail.png`, fullPage: true })
  expect(trail, 'the event trail leaked a page path the site does not collect').not.toContain('SECRET-PATH')
  expect(trail, 'an event property leaked a URL the site does not collect').not.toContain('SECRET-URL')
})

// ════════════════════════════════════════════════════════════════════
test('6 · live mode against REAL realtime-tracker membership', async ({ page }) => {
  test.setTimeout(180_000)
  await page.goto(`${BASE}/sites/${SCALE}/visitors?period=30m`)
  await expect(page.getByRole('heading', { name: 'Visitors', level: 1 })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('Rolling window · resolves against the live tracker')).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/6a-live.png` })

  const chipText = await page.locator('span.bg-brand-orange\\/10').first().innerText()
  // eslint-disable-next-line no-console
  console.log(`LIVE chip: ${chipText}`)
  // Two sessions were placed in the tracker for this site immediately before
  // the run, both with events in the last few minutes.
  await expect(page.getByText(/\d+ on the site now/).first()).toBeVisible()
  const orangeDots = page.locator('span.bg-brand-orange.rounded-full, span.rounded-full.bg-brand-orange')
  // eslint-disable-next-line no-console
  console.log(`LIVE orange dots on page: ${await orangeDots.count()}`)

  // The 30-day roster must show the same visitors with a green active dot.
  await page.goto(`${BASE}/sites/${SCALE}/visitors?period=30&sort=last_seen&order=desc`)
  await rosterReady(page)
  const greenDots = page.locator('span[aria-label="on the site now"]')
  // eslint-disable-next-line no-console
  console.log(`ROSTER green dots: ${await greenDots.count()}`)
  await page.screenshot({ path: `${SHOTS}/6b-roster-active-dots.png` })
  expect(await greenDots.count(), 'no live dot rendered for a session in the tracker').toBeGreaterThan(0)
})

// ════════════════════════════════════════════════════════════════════
test('7 · the failure states: 404, 400, error card, empty range', async ({ page }) => {
  test.setTimeout(240_000)

  // 404 — well-formed key, no such visitor.
  await page.goto(`${BASE}/sites/${SCALE}/visitors/${'0'.repeat(32)}?period=30`)
  await expect(page.getByText('No such visitor in this range')).toBeVisible({ timeout: 30_000 })
  await page.screenshot({ path: `${SHOTS}/7a-404.png` })
  // The screen tells the reader the identity may belong to another month —
  // so it owes them a way to change the range.
  const pickerOn404 = await page.getByRole('button', { name: /Last 30 days|Custom|Today/i }).count()
  // eslint-disable-next-line no-console
  console.log(`404 screen: date pickers present = ${pickerOn404}`)

  // 400 — malformed key. The server rejects the shape; what does the user see?
  await page.goto(`${BASE}/sites/${SCALE}/visitors/not-a-valid-key?period=30`)
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.screenshot({ path: `${SHOTS}/7b-400-malformed-key.png` })
  // eslint-disable-next-line no-console
  console.log(`400 screen text: ${(await page.locator('body').innerText()).slice(0, 200).replace(/\n/g, ' | ')}`)

  // The error card — forced, because nothing else reaches it.
  await page.route('**/api/v1/sites/*/visitors?*', (r) => r.fulfill({ status: 500, body: '{"error":"boom"}' }))
  await page.goto(`${BASE}/sites/${SCALE}/visitors?period=30`)
  await expect(page.getByText("Couldn't load this view")).toBeVisible({ timeout: 30_000 })
  const failed = await page.locator('body').innerText()
  await page.screenshot({ path: `${SHOTS}/7c-error-card.png` })
  // 🔴 On a failed fetch the instrument above must not assert an answer.
  expect(failed, 'the presence field claimed an empty range while the fetch failed')
    .not.toContain('No visitors in this range')
  expect(failed, 'the stats line printed zeros for a request that failed')
    .not.toMatch(/\b0 visitors this range/)
  await page.unroute('**/api/v1/sites/*/visitors?*')

  // An empty but VALID range: the floor day itself, before any fixture data.
  await page.goto(`${BASE}/sites/${SCALE}/visitors?period=custom&start=2026-08-26&end=2026-08-26`)
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.screenshot({ path: `${SHOTS}/7d-empty-range.png` })
})

// ════════════════════════════════════════════════════════════════════
test('8 · navigation: G V, the palette, the shortcuts overlay, the InfoTips', async ({ page }) => {
  test.setTimeout(180_000)
  await page.goto(`${BASE}/sites/${SCALE}`)
  await page.waitForLoadState('networkidle').catch(() => {})

  // G V — never pressed before.
  //
  // ⚠️ Click the page body first. ShortcutHandler deliberately ignores letter
  // keys while focus is in an INPUT, and this app mounts a search field in its
  // chrome — so a bare keyboard.press() on a freshly loaded page can be
  // swallowed by a correctly-behaving guard and read as a broken shortcut.
  await page.locator('main, body').first().click({ position: { x: 5, y: 5 } })
  await page.keyboard.press('g')
  await page.waitForTimeout(120)
  await page.keyboard.press('v')
  await page.waitForURL(/\/visitors/, { timeout: 15_000 })
  await rosterReady(page)
  // eslint-disable-next-line no-console
  console.log(`G V landed on: ${page.url()}`)

  // The InfoTip on the roster card header — wired, never seen rendered.
  const infoTip = page.locator('button[aria-label*="About"], button[aria-label*="info" i]').first()
  if (await infoTip.count()) {
    await infoTip.click()
    await page.waitForTimeout(400)
    await page.screenshot({ path: `${SHOTS}/8a-infotip.png` })
    // eslint-disable-next-line no-console
    console.log(`InfoTip text: ${(await page.locator('body').innerText()).match(/month[^\n]{0,160}/i)?.[0] ?? '<none>'}`)
    await page.keyboard.press('Escape')
  } else {
    // eslint-disable-next-line no-console
    console.log('InfoTip: no button matched — check the trigger markup')
  }

  // The shortcuts overlay must list the row.
  await page.keyboard.press('?')
  await page.waitForTimeout(600)
  const overlay = await page.locator('body').innerText()
  await page.screenshot({ path: `${SHOTS}/8b-shortcuts-overlay.png` })
  expect(overlay, 'the shortcuts overlay does not list Visitors').toContain('Visitors')
  await page.keyboard.press('Escape')

  // The command palette must offer it.
  await page.keyboard.press('Meta+k')
  await page.waitForTimeout(600)
  await page.keyboard.type('visit')
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${SHOTS}/8c-command-palette.png` })
  expect(await page.locator('body').innerText(), 'the command palette does not offer Visitors').toContain('Visitors')
})

// ════════════════════════════════════════════════════════════════════
test('9 · three widths — the roster row has never been measured below 1440', async ({ page }) => {
  test.setTimeout(240_000)
  for (const [w, h, name] of [[375, 812, 'mobile'], [768, 1024, 'tablet'], [1024, 900, 'laptop']] as const) {
    await page.setViewportSize({ width: w, height: h })
    await page.goto(`${BASE}/sites/${DRIVE}/visitors?period=30`)
    await rosterReady(page)
    await page.screenshot({ path: `${SHOTS}/9-roster-${name}-${w}.png`, fullPage: true })

    // The page body must never scroll sideways.
    const overflow = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth,
      win: window.innerWidth,
    }))
    // eslint-disable-next-line no-console
    console.log(`WIDTH ${w}: scrollWidth=${overflow.doc} innerWidth=${overflow.win}`)
    expect(overflow.doc, `horizontal overflow at ${w}px`).toBeLessThanOrEqual(overflow.win + 1)

    // How much room is actually left for the name and the meta line?
    const room = await page.evaluate(() => {
      const row = document.querySelector('a[href*="/visitors/"]')
      const nameBox = row?.querySelector('div.min-w-0.flex-1')
      return nameBox ? Math.round(nameBox.getBoundingClientRect().width) : -1
    })
    // eslint-disable-next-line no-console
    console.log(`WIDTH ${w}: identity column = ${room}px`)

    await page.goto(`${BASE}/sites/${DRIVE}/visitors/${(await firstKey(page)) ?? TRAIL_VISITOR}?period=30`)
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.screenshot({ path: `${SHOTS}/9-detail-${name}-${w}.png`, fullPage: true })
  }
})

async function firstKey(page: Page): Promise<string | null> {
  const href = await page.locator('a[href*="/visitors/"]').first().getAttribute('href').catch(() => null)
  return href?.match(/([0-9a-f]{32})/)?.[1] ?? null
}

// ════════════════════════════════════════════════════════════════════
test('10 · a viewer in another timezone sees the SITE\'s days, not their own', async ({ browser }) => {
  test.setTimeout(240_000)
  // The fixture site is Europe/Brussels. Pacific/Auckland is +10/+12 hours from
  // it, so any date the browser computes will disagree with the server's.
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    timezoneId: 'Pacific/Auckland',
    locale: 'en-GB',
    storageState: STATE,
  })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/sites/${SCALE}/visitors/${MANY_VISITS}?period=30`)
  await expect(page.getByText('newest first')).toBeVisible({ timeout: 30_000 })
  await page.screenshot({ path: `${SHOTS}/10a-detail-auckland.png`, fullPage: true })

  const reset = await page.locator('text=/this identity resets/').first().innerText()
  const firstVisit = await page
    .locator('button[aria-expanded]')
    .filter({ hasText: /\d+ pages?\s·/ })
    .first()
    .innerText()
  // eslint-disable-next-line no-console
  console.log(`AUCKLAND reset line : ${reset.replace(/\n/g, ' ')}`)
  // eslint-disable-next-line no-console
  console.log(`AUCKLAND first visit: ${firstVisit.replace(/\n/g, ' | ')}`)

  // The same page from the site's own zone, for the diff.
  const ctx2 = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    timezoneId: 'Europe/Brussels',
    locale: 'en-GB',
    storageState: STATE,
  })
  const page2 = await ctx2.newPage()
  await page2.goto(`${BASE}/sites/${SCALE}/visitors/${MANY_VISITS}?period=30`)
  await expect(page2.getByText('newest first')).toBeVisible({ timeout: 30_000 })
  await page2.screenshot({ path: `${SHOTS}/10b-detail-brussels.png`, fullPage: true })
  const reset2 = await page2.locator('text=/this identity resets/').first().innerText()
  const firstVisit2 = await page2
    .locator('button[aria-expanded]')
    .filter({ hasText: /\d+ pages?\s·/ })
    .first()
    .innerText()
  // eslint-disable-next-line no-console
  console.log(`BRUSSELS reset line : ${reset2.replace(/\n/g, ' ')}`)
  // eslint-disable-next-line no-console
  console.log(`BRUSSELS first visit: ${firstVisit2.replace(/\n/g, ' | ')}`)

  // The server resolves this range and this month in the SITE's timezone. Two
  // readers of the same site must be shown the same day for the same visit.
  expect(firstVisit, 'the same visit renders on different days for different viewers').toBe(firstVisit2)
  expect(reset, 'the identity reset date depends on who is looking').toBe(reset2)

  await ctx.close()
  await ctx2.close()
})

// ════════════════════════════════════════════════════════════════════
test('11 · the OFF room, its button, and the disable direction', async ({ page }) => {
  test.setTimeout(240_000)
  await page.goto(`${BASE}/sites/${OFF}/visitors`)
  await expect(page.getByText('Visitor-level views are off')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('Pulse collects the same data either way')).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/11a-off-room.png` })

  await page.getByRole('button', { name: 'Enable visitor views' }).click()
  await expect(page.getByText('Visitor-level views are off')).toBeHidden({ timeout: 30_000 })
  await expect(page.getByRole('heading', { name: 'Visitors', level: 1 })).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/11b-after-enable.png` })

  // The rename bug: the site is named "[QA] Visitors Off", its domain is
  // qa-visitors-off.example.com — deliberately different, so a rename has
  // nowhere to hide.
  const chrome = (await page.locator('header, nav').first().innerText()).toLowerCase()
  expect(chrome, 'enabling renamed the site to its domain').not.toContain('qa-visitors-off.example.com')

  // Now the DISABLE direction, through the settings toggle — never exercised,
  // and the audit log has never recorded one.
  await page.goto(`${BASE}/sites/${OFF}/settings?tab=privacy`)
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.screenshot({ path: `${SHOTS}/11c-settings-privacy.png`, fullPage: true })
  // The tab must not open dirty — the third shipped bug was exactly this.
  const dirty = await page.getByText('Unsaved changes').count()
  // eslint-disable-next-line no-console
  console.log(`SETTINGS privacy tab opened dirty: ${dirty > 0}`)
  expect(dirty, 'the privacy tab opened with unsaved changes before any edit').toBe(0)

  const sw = page.locator('button[role="switch"]').filter({ hasText: '' })
  // eslint-disable-next-line no-console
  console.log(`switches on the privacy tab: ${await sw.count()}`)
})
