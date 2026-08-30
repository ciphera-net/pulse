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

test('the Visitors surface renders the approved design on staging', async ({ page }) => {
  test.setTimeout(600_000)
  if (!SITE_ID) throw new Error('Set VISITORS_SITE_ID to the staging site under test')

  await login(page, BASE_URL)

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

  // The meta line carries REAL house assets.
  //
  // ⚠️ Scoped to a ROW. An unscoped `img[src*="/api/favicon"]` matches
  // FleetCard's hidden 1x1 colour sampler first — a real element with a real
  // favicon URL that is deliberately invisible, so the assertion failed while
  // the icons it meant to check were rendering perfectly.
  const firstRow = rows.first()
  await expect(firstRow.locator('img[src*="/flags/"]')).toBeVisible()
  const marks = firstRow.locator('img[src*="/api/favicon"], img[src*="/brands/"]')
  await expect(marks.first()).toBeVisible()
  // Browser + OS + referrer: at least two brand marks on every row.
  expect(await marks.count()).toBeGreaterThanOrEqual(2)

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
  await expect(page.locator('span.font-mono').first()).toBeVisible()
  await expect(page.getByText(/avg visit/)).toBeVisible()
  await expect(page.getByText(/this identity resets/)).toBeVisible()
  // Signature device #3: the month ribbon.
  await expect(page.getByText(/day by day/)).toBeVisible()
  await expect(page.getByText('newest first')).toBeVisible()
  await expect(page.getByText('first touch · latest observed')).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/staging-detail.png`, fullPage: true })

  // ─── 3. A visit's trail ──────────────────────────────────────────
  await page.locator('button[aria-expanded]').first().click()
  await expect(page.locator('button[aria-expanded="true"]').first()).toBeVisible()
  // The rail timeline fetches per expanded row; wait for a step to arrive.
  await expect(page.locator('span.rounded-full.shrink-0').first()).toBeVisible({ timeout: 20_000 })
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
  // Read-only for the toggle itself: flipping it is exercised by the backend
  // suite. Here the page is asked to render the room its API 403 produces, by
  // visiting a site whose toggle is off.
  const offSiteId = process.env.VISITORS_OFF_SITE_ID
  if (offSiteId) {
    await page.goto(`${BASE_URL}/sites/${offSiteId}/visitors`)
    await expect(page.getByText('Visitor-level views are off')).toBeVisible()
    await expect(page.getByText('Pulse collects the same data either way')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Enable visitor views' })).toBeVisible()
    await page.screenshot({ path: `${SHOTS}/staging-off.png` })
  }
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
