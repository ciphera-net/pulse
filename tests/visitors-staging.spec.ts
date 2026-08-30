import { existsSync, readFileSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import { login } from './support/login'

/**
 * Visitors surface — staging walkthrough and screenshot capture.
 *
 * Walks the approved design (docs/plans/30-08-2026-visitors-surface-design.md
 * §9a) on the deployed staging stack and captures each state for comparison
 * against the round-4 mocks in docs/data/30-08-2026-visitors-mocks/.
 *
 * It ASSERTS as it goes rather than only screenshotting. A screenshot proves a
 * page rendered; it does not prove the page rendered the right thing, and a
 * blank card photographs perfectly well.
 *
 * 🔴 ONE TEST, DELIBERATELY, because it costs a human a second factor.
 * Playwright gives every test a fresh browser context, so four tests meant four
 * OPAQUE logins and up to four codes fetched from an authenticator by hand. The
 * walkthrough is one linear journey anyway; splitting it bought isolation
 * nobody needed and charged a person four trips to their phone for it.
 *
 * Data: the staging site is seeded with SYNTHETIC visitors. Staging has had its
 * own database (`pulse_staging`) since 17-07-2026, so nothing here can reach
 * production data.
 *
 * Run:
 *   SMOKE_BASE_URL=https://pulse-staging.ciphera.net \
 *   VISITORS_SITE_ID=<uuid> npx playwright test tests/visitors-staging.spec.ts
 */

const BASE_URL = process.env.SMOKE_BASE_URL ?? 'https://pulse-staging.ciphera.net'
const SITE_ID = process.env.VISITORS_SITE_ID ?? ''
const SHOTS = process.env.VISITORS_SHOT_DIR ?? '/tmp/visitors-staging'

// 1440×1000 is the house mock viewport — the same one every options round was
// rendered at, so a capture here is directly comparable to round4-*.png.
test.use({ viewport: { width: 1440, height: 1000 } })

/**
 * Where to cache the signed-in session between runs.
 *
 * 🔴 EVERY RUN OF THIS SPEC COSTS A HUMAN A TRIP TO AN AUTHENTICATOR. Iterating
 * on the walkthrough itself — a stale selector, a missing capture — then costs
 * one code per iteration, and getting through this one took four. Caching the
 * session after a successful login makes every later run free until the refresh
 * token expires.
 *
 * ⚠️ THE FILE IS A LIVE CREDENTIAL. Scratch directory only — never the repo,
 * never a fixture — and delete it when the debugging session ends. Leave
 * VISITORS_STORAGE_STATE unset to always log in fresh.
 */
const STATE_PATH = process.env.VISITORS_STORAGE_STATE ?? ''

test('the Visitors surface renders the approved design on staging', async ({ page }) => {
  test.setTimeout(600_000)
  if (!SITE_ID) throw new Error('Set VISITORS_SITE_ID to the staging site under test')

  let authed = false
  if (STATE_PATH && existsSync(STATE_PATH)) {
    const saved = JSON.parse(readFileSync(STATE_PATH, 'utf8'))
    await page.context().addCookies(saved.cookies ?? [])
    await page.goto(`${BASE_URL}/sites/${SITE_ID}/visitors?period=30`)
    // Prove the session actually works rather than assuming a file means authed
    // — a stale cookie jar would otherwise fail later, in a confusing place.
    authed = await page
      .getByRole('heading', { name: 'Visitors', level: 1 })
      .isVisible({ timeout: 15_000 })
      .catch(() => false)
    if (!authed) console.log('cached session is stale — logging in again')
  }
  if (!authed) {
    await login(page, BASE_URL)
    if (STATE_PATH) {
      await page.context().storageState({ path: STATE_PATH })
      console.log(`session cached at ${STATE_PATH} — later runs need no code`)
    }
  }

  // ─── 1. The roster ───────────────────────────────────────────────
  await page.goto(`${BASE_URL}/sites/${SITE_ID}/visitors?period=30`)
  await expect(page.getByRole('heading', { name: 'Visitors', level: 1 })).toBeVisible()
  await expect(page.getByText('Every reader is a month-long pseudonym')).toBeVisible()
  await expect(page.getByText('Data begins 26 Aug 2026')).toBeVisible()

  const rows = page.locator('a[href*="/visitors/"]')
  await expect(rows.first()).toBeVisible()
  expect(await rows.count()).toBeGreaterThan(0)

  // Signature device #1: the presence field drew dots, not an empty panel.
  await expect(page.getByText('Each dot is one visitor')).toBeVisible()

  // Signature device #2: a journey strand per row, as inline SVG.
  expect(await page.locator('svg circle').count()).toBeGreaterThan(0)

  // The meta line carries the HOUSE registry's assets — the same artwork the
  // Dashboard draws. Two things this assertion learned the hard way:
  //
  // ⚠️ SCOPE IT TO A ROW. An unscoped `img[src*="/api/favicon"]` matches
  // FleetCard's hidden 1x1 colour sampler first — a real element with a real
  // favicon URL that is deliberately invisible.
  //
  // 🔴 ASSERT IT PAINTED, NOT THAT THE TAG EXISTS. `toBeVisible()` passes on an
  // <img> whose request is still in flight or has failed: the element is laid
  // out, it just has nothing in it. That is exactly the state the owner
  // reported ("where are the icons?"), so the check has to be the one a person
  // makes — did a picture appear — which is `naturalWidth > 0`. CDN images are
  // third-party and slower than the same-origin favicon proxy, so this also
  // stops the run screenshotting a half-loaded page.
  const firstRow = rows.first()
  const houseIcons = firstRow.locator(
    'img[src*="/flags/"], img[src*="/icons/browsers/"], img[src*="/icons/os/"], img[src*="/icons/brands/"], img[src*="/api/favicon"]',
  )
  await expect(houseIcons.first()).toBeVisible()
  // flag + browser + OS, at minimum, plus a referrer mark on most rows.
  expect(await houseIcons.count()).toBeGreaterThanOrEqual(3)

  await expect
    .poll(
      async () =>
        houseIcons.evaluateAll((els) =>
          els.filter((e) => (e as HTMLImageElement).naturalWidth > 0).length,
        ),
      { timeout: 20_000, message: 'row icons never painted (naturalWidth stayed 0)' },
    )
    .toBeGreaterThanOrEqual(3)

  // 🔴 The browser and the OS must come from the REGISTRY, positively stated.
  //
  // The negative ("no /api/favicon anywhere in the row") would be wrong: a
  // referrer on a domain we hold no curated art for is SUPPOSED to resolve
  // through Sigil. What must never happen is a browser or an OS doing so — the
  // bug the owner caught, website favicons at arbitrary aspect ratios that do
  // not match the Dashboard.
  await expect(firstRow.locator('img[src*="/icons/browsers/"]')).toHaveCount(1)
  await expect(firstRow.locator('img[src*="/icons/os/"]')).toHaveCount(1)

  // Pseudonyms, not hashes: a row's name is two capitalised words.
  expect(await firstRow.locator('span').first().innerText()).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/)

  // 🔴 Labelled dots must not overlap. The lane is hash-derived jitter with no
  // collision avoidance — fine for a bare dot, not fine for a name. Two labels
  // printed on top of each other on the first staging run.
  await assertNoLabelOverlap(page)

  await page.screenshot({ path: `${SHOTS}/staging-list.png` })

  // ─── 2. A visitor ────────────────────────────────────────────────
  await rows.first().click()
  await page.waitForURL(/\/visitors\/[0-9a-f]{32}/)

  // The hash is always visible beside the pseudonym — it is the true key.
  // Scoped to the h1: `span.font-mono` unscoped matches code spans elsewhere.
  await expect(page.getByRole('heading', { level: 1 }).locator('span.font-mono')).toBeVisible()
  await expect(page.getByText(/avg visit/)).toBeVisible()
  await expect(page.getByText(/this identity resets/)).toBeVisible()
  // Signature device #3: the month ribbon.
  await expect(page.getByText(/day by day/)).toBeVisible()
  await expect(page.getByText('newest first')).toBeVisible()
  await expect(page.getByText('first touch · latest observed')).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/staging-detail.png`, fullPage: true })

  // ─── 3. A visit's trail ──────────────────────────────────────────
  //
  // ⚠️ SCOPED TO THE VISITS CARD. An unscoped `button[aria-expanded]` matched
  // the NOTIFICATIONS BELL in the app header and opened its popover over half
  // the page — the same unscoped-locator mistake as the favicon sampler, and it
  // reported the trail missing when the trail had never been asked to open.
  const visitToggle = page
    .locator('button[aria-expanded]')
    .filter({ hasText: /\d+ pages?\s·/ })
    .first()
  await visitToggle.click()
  await expect(visitToggle).toHaveAttribute('aria-expanded', 'true')
  // The rail timeline fetches per expanded row; wait for a step to arrive.
  // Scoped to the expanded panel — an active-now dot is also a rounded-full
  // shrink-0 span, and matching one of those would pass without a trail.
  const trail = page.locator('div.pb-3.pl-12')
  await expect(trail.locator('span.rounded-full').first()).toBeVisible({ timeout: 20_000 })
  await page.screenshot({ path: `${SHOTS}/staging-detail-expanded.png`, fullPage: true })

  // ─── 4. Live mode ────────────────────────────────────────────────
  await page.goto(`${BASE_URL}/sites/${SITE_ID}/visitors?period=30m`)
  await expect(page.getByText('On the site now')).toBeVisible()
  await expect(page.getByText('Rolling window · resolves against the live tracker')).toBeVisible()
  // The field's tick labels are MINUTES now, not dates — a live view whose axis
  // is in days would put every dot in one column.
  await expect(page.locator('div.absolute.inset-x-3.bottom-2 span').first()).toHaveText(
    /^\d{2}:\d{2}$/,
  )
  await assertNoLabelOverlap(page)
  await page.screenshot({ path: `${SHOTS}/staging-live.png` })

  // ─── 5. The date picker refuses to offer a day before the floor ──
  await page.goto(`${BASE_URL}/sites/${SITE_ID}/visitors?period=30`)
  await expect(page.getByRole('heading', { name: 'Visitors', level: 1 })).toBeVisible()
  await page.getByRole('button', { name: /Last 30 days/i }).first().click()
  const backAMonth = page.getByRole('button', { name: /previous month/i }).first()
  if (await backAMonth.isVisible().catch(() => false)) await backAMonth.click()
  await page.screenshot({ path: `${SHOTS}/staging-picker-floor.png` })
  await page.keyboard.press('Escape')

  // ─── 6. The OFF room ─────────────────────────────────────────────
  //
  // ⚠️ ORDERED BEFORE THE DASHBOARD DELIBERATELY. This is a state of the
  // feature; the dashboard capture below is a comparison nicety. When the
  // dashboard step failed on a missing h1, it stranded this one behind it — a
  // convenience must never gate a subject.
  const offSiteId = process.env.VISITORS_OFF_SITE_ID
  if (offSiteId) {
    await page.goto(`${BASE_URL}/sites/${offSiteId}/visitors`)
    await expect(page.getByText('Visitor-level views are off')).toBeVisible()
    await expect(page.getByText('Pulse collects the same data either way')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Enable visitor views' })).toBeVisible()
    await page.screenshot({ path: `${SHOTS}/staging-off.png` })

    // ─── 6b. ACTUALLY PRESS THE BUTTON ─────────────────────────────
    //
    // 🔴 THIS STEP EXISTS BECAUSE ITS ABSENCE SHIPPED THREE BUGS. The earlier
    // walkthrough RENDERED this room and never clicked it, so it verified the
    // door and not the doorway: enabling renamed the site to its domain, the
    // room survived its own success toast until a manual refresh, and the
    // settings tab opened dirty with the toggle inverted. A capture of a room
    // is not a test of its door.
    if (process.env.VISITORS_CLICK_ENABLE === '1') {
      const nameBefore = await page
        .locator('nav a, header a, [aria-label*="readcrumb"] a')
        .filter({ hasText: /\S/ })
        .allInnerTexts()
        .catch(() => [] as string[])

      await page.getByRole('button', { name: 'Enable visitor views' }).click()

      // The room must go WITHOUT a reload. It used to persist because SWR held
      // the toggle-off 403 against a key that never changes when the site does.
      await expect(page.getByText('Visitor-level views are off')).toBeHidden({ timeout: 20_000 })
      await expect(page.getByRole('heading', { name: 'Visitors', level: 1 })).toBeVisible()
      await page.screenshot({ path: `${SHOTS}/staging-after-enable.png` })

      // The breadcrumb still names the SITE, not its domain — the rename bug
      // would have turned "[QA] Visitors Off" into "qa-visitors-off.example.com".
      const crumbs = (await page.locator('header, nav').first().innerText()).toLowerCase()
      expect(crumbs).not.toContain('qa-visitors-off.example.com')
      void nameBefore
    }
  }

  // ─── 7. The DASHBOARD, for side-by-side icon comparison ──────────
  //
  // The whole point of the icon rewrite: the roster's browser/OS marks must be
  // the SAME artwork this card draws. Captured in the same run, at the same
  // viewport, so the two screenshots can be put next to each other.
  //
  // No h1 assertion — the dashboard does not render one, and requiring it is
  // what stranded the OFF room above.
  await page.goto(`${BASE_URL}/sites/${SITE_ID}`)
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.screenshot({ path: `${SHOTS}/staging-dashboard-for-comparison.png`, fullPage: true })
})

/** No two names in the presence field may share pixels. */
async function assertNoLabelOverlap(page: import('@playwright/test').Page) {
  const boxes = await page
    .locator('div.absolute.-translate-y-1\\/2 span.whitespace-nowrap')
    .evaluateAll((els) =>
      els
        .map((e) => e.getBoundingClientRect())
        .map((r) => ({ top: r.top, bottom: r.bottom, left: r.left, right: r.right })),
    )
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]
      const b = boxes[j]
      const overlaps = a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
      expect(overlaps, `presence-field labels ${i} and ${j} overlap`).toBe(false)
    }
  }
}
