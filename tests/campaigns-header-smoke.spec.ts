import { test, expect, type Page, type BrowserContext } from '@playwright/test'
import fs from 'node:fs'

/**
 * Pre-PR dev-server smoke for the Campaigns card header (05-09-2026):
 * the card's Export button and Build URL button (plus the empty state's
 * "Build a UTM URL" action) are gone; tabs, info tip, unit label and the
 * pager survive.
 *
 * Runs against a LOCAL dev server via the public share route, which mounts the
 * same Campaigns component file as the authed dashboard. Every API call the
 * page makes is intercepted and fulfilled locally, so no login is needed. The
 * base payload is the demo site's live public dashboard (the same auth-free
 * read /demo performs) — only its SHAPE matters, because the campaigns rows
 * are swapped for a deterministic set. Point CAMPAIGNS_FIXTURE at a saved
 * payload to run fully offline.
 *
 *   npx next dev -p 3003            # in another shell, from this repo
 *   SMOKE_BASE_URL=http://localhost:3003 \
 *   CAMPAIGNS_OUT=/path/to/out-dir \
 *   npx playwright test tests/campaigns-header-smoke.spec.ts
 */

const BASE_URL = process.env.SMOKE_BASE_URL ?? 'http://localhost:3003'
const FIXTURE = process.env.CAMPAIGNS_FIXTURE
const OUT = process.env.CAMPAIGNS_OUT ?? 'test-results'
const SITE_ID = 'e6a95eb8-8edb-44d4-a4e2-c400aea174a4'
const DEMO_PAYLOAD_URL =
  `https://pulse-api.ciphera.net/api/v1/public/sites/${SITE_ID}/dashboard?limit=10&interval=day&period=30d`

async function loadBasePayload(): Promise<Record<string, unknown>> {
  if (FIXTURE) return JSON.parse(fs.readFileSync(FIXTURE, 'utf8'))
  const res = await fetch(DEMO_PAYLOAD_URL)
  if (!res.ok) throw new Error(`demo payload fetch failed: HTTP ${res.status} (set CAMPAIGNS_FIXTURE to run offline)`)
  return (await res.json()) as Record<string, unknown>
}

// Nine grouped sources → two pages at LIMIT 7, so the pager renders too.
const CAMPAIGN_ROWS = [
  ['google', 'cpc', 'launch', 157, 210],
  ['linkedin', 'social', 'launch', 96, 130],
  ['newsletter', 'email', 'sept-digest', 74, 101],
  ['x', 'social', 'launch', 41, 55],
  ['reddit', 'social', 'ama', 33, 47],
  ['producthunt', 'referral', 'launch', 28, 39],
  ['bing', 'cpc', 'brand', 19, 24],
  ['mastodon', 'social', 'launch', 12, 15],
  ['duckduckgo', 'cpc', 'brand', 9, 11],
].map(([source, medium, campaign, visitors, pageviews]) => ({
  source, medium, campaign, term: '', content: '', visitors, pageviews,
  bounce_rate: null, avg_duration: null,
}))

function corsHeaders(origin: string) {
  // The share fetch is CREDENTIALED, so a wildcard origin is refused by the
  // browser — echo the exact origin and allow credentials.
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-credentials': 'true',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
  }
}

async function installFixture(context: BrowserContext, campaigns: unknown[]) {
  const base = await loadBasePayload()
  const payload = { ...base, campaigns }
  const origin = new URL(BASE_URL).origin
  const seen: string[] = []

  await context.route('**/*.ciphera.net/**', async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    seen.push(`${req.method()} ${url.pathname}`)
    if (req.method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: corsHeaders(origin) })
    }
    if (/\/public\/sites\/[^/]+\/dashboard$/.test(url.pathname)) {
      return route.fulfill({ status: 200, headers: { ...corsHeaders(origin), 'content-type': 'application/json' }, body: JSON.stringify(payload) })
    }
    if (/\/public\/sites\/[^/]+\/realtime$/.test(url.pathname)) {
      return route.fulfill({ status: 200, headers: { ...corsHeaders(origin), 'content-type': 'application/json' }, body: JSON.stringify({ visitors: 3 }) })
    }
    // Anything else (favicons via the CDN, fonts) — let it through.
    return route.continue()
  })
  return seen
}

async function openShare(page: Page) {
  await page.goto(`${BASE_URL}/share/${SITE_ID}`)
  // The card mounts once the payload lands; assert we are still on the local
  // origin (a bounce anywhere else is a failure, never a capture).
  // Since 06-09-2026 the campaign rows live behind the Sources card's third
  // view (owner pick BH) — open it before asserting on the header.
  const card = page.locator('[data-tour-card="referrers"]')
  await expect(card).toBeVisible({ timeout: 60_000 })
  await card.getByRole('radio', { name: 'Campaigns' }).click()
  expect(new URL(page.url()).origin).toBe(new URL(BASE_URL).origin)
  return card
}

test.use({ serviceWorkers: 'block', viewport: { width: 1440, height: 1000 } })

test.describe('Campaigns card header (dev-server smoke)', () => {
  test('with rows: tabs + unit label only; no Export, no Build URL; pager present', async ({ page, context }) => {
    const seen = await installFixture(context, CAMPAIGN_ROWS)
    const card = await openShare(page)

    // Rows landed (top source on page 1, and the last of the nine is on page 2).
    await expect(card.getByText('Google', { exact: true })).toBeVisible()
    await expect(card.getByText('duckduckgo')).toHaveCount(0)
    await expect(card.getByLabel('Next page')).toBeVisible()

    // The header: five dimension tabs, the unit label, and nothing actionable.
    await expect(card.getByRole('radio')).toHaveCount(3)
    await expect(card.getByText('visitors', { exact: true }).first()).toBeVisible()
    await expect(card.getByRole('button', { name: 'Export' })).toHaveCount(0)
    await expect(card.getByRole('button', { name: 'Build URL' })).toHaveCount(0)
    await expect(card.getByText('Build URL')).toHaveCount(0)
    await expect(card.getByText('Export', { exact: true })).toHaveCount(0)

    // Positive control for the negative assertions above: the DECK's own Export
    // (site-wide, ExportModal) is a different control and must still exist on
    // the page — proves "no Export in the card" is not "the page failed to render".
    await expect(page.getByRole('button', { name: /export/i })).toHaveCount(1)

    // Header geometry: the unit label sits flush to the card's right padding edge.
    const cardBox = (await card.boundingBox())!
    const unit = card.getByText('visitors', { exact: true }).first()
    const unitBox = (await unit.boundingBox())!
    const rightGap = cardBox.x + cardBox.width - (unitBox.x + unitBox.width)
    expect(rightGap, `unit label right gap ${rightGap}px should equal the 24px card padding`).toBeGreaterThanOrEqual(22)
    expect(rightGap).toBeLessThanOrEqual(26)

    await card.scrollIntoViewIfNeeded()
    await page.waitForTimeout(600)
    await card.screenshot({ path: `${OUT}/campaigns-card-rows.png` })
    await page.screenshot({ path: `${OUT}/campaigns-page-rows.png` })

    // Nothing left the fixture: every API call was answered locally.
    expect(seen.some((s) => /\/public\/sites\/.+\/dashboard/.test(s)), `API calls seen: ${seen.join(' | ')}`).toBe(true)
  })

  test('empty: "No UTM data yet" with no builder action', async ({ page, context }) => {
    await installFixture(context, [])
    const card = await openShare(page)

    await expect(card.getByText('No UTM data yet')).toBeVisible()
    await expect(card.getByRole('button', { name: /Build a UTM URL/ })).toHaveCount(0)
    await expect(card.getByRole('link', { name: /Build a UTM URL/ })).toHaveCount(0)
    await expect(card.getByText('Build URL')).toHaveCount(0)
    await expect(card.getByRole('radio')).toHaveCount(3)

    await card.scrollIntoViewIfNeeded()
    await page.waitForTimeout(600)
    await card.screenshot({ path: `${OUT}/campaigns-card-empty.png` })
  })
})
