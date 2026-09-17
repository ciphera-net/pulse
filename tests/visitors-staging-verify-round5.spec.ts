import { test, expect, Page } from '@playwright/test'
import { existsSync } from 'node:fs'

/**
 * Staging verification for the 10-09-2026 Visitors work.
 *
 * Covers what jsdom cannot: the wire as the deployed server actually answers it,
 * the accessibility tree on the real page with the real CSS, and the geometry
 * claims the accessibility PR made about being pixel-neutral.
 *
 * Read-only. Nothing is submitted, created or changed.
 */
const BASE = process.env.SMOKE_BASE_URL ?? 'https://pulse-staging.ciphera.net'
const SITE = process.env.VISITORS_SITE_ID ?? '22222222-2222-4333-8444-555555555555'
const STATE = process.env.PW_STATE ?? '/tmp/pulse-staging-state.json'
const OUT = process.env.SHOT_DIR ?? '.'

const log: string[] = []
function note(s: string) { log.push(s); console.log(s) }

test.use({ storageState: existsSync(STATE) ? STATE : undefined })

/**
 * 🔴 WRITE THE COOKIE JAR BACK AFTER EVERY TEST.
 *
 * Pulse ROTATES refresh tokens, and re-presenting a rotated one REVOKES the
 * session. Each test gets its own browser context loading the same cached jar,
 * so as soon as one context refreshes, every later test is presenting a token
 * that has already been spent — and the whole run dies with "Signed out."
 *
 * Measured 10-09-2026: each of these tests passed when run ALONE, and five of six
 * failed at the roster's visibility check when run together over 3.9 minutes.
 * That reads as five broken features and is one expired session.
 *
 * `tests/visitors-audit.spec.ts` gets away without this only because it runs
 * inside a single access-token lifetime.
 */
test.afterEach(async ({ page }) => {
  if (!existsSync(STATE)) return
  try {
    await page.context().storageState({ path: STATE })
  } catch {
    // A context already closed by a failing test is not worth failing the run for.
  }
})

async function openRoster(page: Page) {
  await page.goto(`${BASE}/sites/${SITE}/visitors?period=30`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Visitors', level: 1 })).toBeVisible({ timeout: 40_000 })
  await expect(page.locator('a[href*="/visitors/"]').first(),
    'the roster must have rows — an empty page verifies nothing').toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(1200)
}

test('H2 — the wire carries the site calendar, and the page renders in it', async ({ page }) => {
  test.setTimeout(4 * 60 * 1000)
  await page.setViewportSize({ width: 1440, height: 1000 })

  const bodies: Record<string, unknown> = {}
  page.on('response', async (r) => {
    const u = r.url()
    if (!u.includes('/api/v1/sites/') || !u.includes('/visitors')) return
    try {
      const j = JSON.parse(await r.text())
      bodies[u.replace(/^https:\/\/[^/]+/, '').split('?')[0]] = j
    } catch { /* not json */ }
  })

  await openRoster(page)
  const rosterBody = Object.entries(bodies).find(([k]) => k.endsWith('/visitors'))?.[1] as
    | { site_timezone?: string; total?: number; visitors?: unknown[] }
    | undefined
  expect(rosterBody, 'the roster endpoint must have answered').toBeTruthy()
  expect(rosterBody!.site_timezone, 'site_timezone must be on the roster response').toBeTruthy()
  note(`roster wire: site_timezone=${rosterBody!.site_timezone} total=${rosterBody!.total}`)

  // Open a visitor and read the profile response.
  const href = await page.evaluate(() =>
    (document.querySelector('a[href*="/visitors/"]') as HTMLAnchorElement | null)?.getAttribute('href') ?? null)
  expect(href).not.toBeNull()
  await page.goto(`${BASE}${href}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3000)

  const profile = Object.entries(bodies).find(([k]) => /\/visitors\/[0-9a-f]{32}$/.test(k))?.[1] as
    | { site_timezone?: string; visitor?: { month?: string; month_resets_at?: string | null } }
    | undefined
  expect(profile, 'the profile endpoint must have answered').toBeTruthy()
  expect(profile!.site_timezone, 'site_timezone must be on the profile response').toBeTruthy()

  const month = profile!.visitor?.month
  const resets = profile!.visitor?.month_resets_at
  note(`profile wire: month=${month} month_resets_at=${resets} site_timezone=${profile!.site_timezone}`)
  expect(resets, 'month_resets_at must be present').toBeTruthy()

  // 🔑 THE PROPERTY: the instant, read back in the SITE's zone, is midnight on
  // the 1st of the month AFTER the identity's month. That is the whole contract,
  // and it is what the client can no longer compute for itself.
  const local = new Date(resets as string).toLocaleString('en-CA', {
    timeZone: profile!.site_timezone,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  })
  note(`month_resets_at rendered in ${profile!.site_timezone}: ${local}`)
  expect(local, 'the reset instant must be midnight on the 1st in the SITE zone').toMatch(/-01, 00:00$/)
  const [y, m] = (month as string).split('-').map(Number)
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
  expect(local.startsWith(next), `reset month must follow ${month}`).toBeTruthy()

  await page.screenshot({ path: `${OUT}/verify-detail.png` })
  note(JSON.stringify(log, null, 1))
})

test('H5 — the accessibility tree on the real page, and the pixel-neutrality claim', async ({ page }) => {
  test.setTimeout(4 * 60 * 1000)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await openRoster(page)

  // ── the roster row's accessible name, on the real page ──────────────────
  const rowName = await page.evaluate(() => {
    const a = document.querySelector('a[href*="/visitors/"]') as HTMLElement | null
    if (!a) return null
    // Strip aria-hidden subtrees, which is what the platform does.
    const clone = a.cloneNode(true) as HTMLElement
    clone.querySelectorAll('[aria-hidden="true"]').forEach((n) => n.remove())
    return (clone.textContent || '').replace(/\s+/g, ' ').trim()
  })
  expect(rowName, 'a roster row must be present').toBeTruthy()
  note(`ROW ACCESSIBLE TEXT: "${rowName}"`)
  // The measured "before" was "…viaGoogle 372h ago" — three unlabelled numbers.
  expect(rowName!).toMatch(/\d+ (visit|visits)/)
  expect(rowName!).toMatch(/\d+ (page|pages)/)
  expect(rowName!).toMatch(/last seen /)

  // ── headings exist below the h1 ─────────────────────────────────────────
  const headings = await page.evaluate(() =>
    [...document.querySelectorAll('h1, h2')].map((h) => `${h.tagName}: ${h.textContent?.trim()}`))
  note(`HEADINGS: ${JSON.stringify(headings)}`)
  expect(headings.some((h) => h.startsWith('H2')), 'the roster card must be a real heading').toBeTruthy()

  // ── 🔑 THE PIXEL-NEUTRALITY CLAIM, MEASURED ─────────────────────────────
  // The accessibility PR asserted that <span> → <h2> changes nothing, on the
  // grounds that the shipped bundle resets heading size, weight and margin.
  // Here is that claim against the rendered page rather than against the CSS.
  const h2 = await page.evaluate(() => {
    // ⚠️ THE ROSTER CARD'S HEADING, BY NAME. "the first non-empty h2" picked the
    // command palette's `sr-only` DialogTitle, whose computed margin is -1px on
    // every side — the sr-only signature — and the assertion failed against a
    // heading this work never touched. Assert the element you mean.
    const el = [...document.querySelectorAll('h2')].find((h) =>
      /readers|On the site now/i.test(h.textContent || ''))
    if (!el) return null
    const s = getComputedStyle(el)
    return { fontSize: s.fontSize, fontWeight: s.fontWeight, margin: [s.marginTop, s.marginRight, s.marginBottom, s.marginLeft].join(' ') }
  })
  expect(h2, "the roster card's heading must be an h2").not.toBeNull()
  note(`H2 COMPUTED: ${JSON.stringify(h2)}`)
  expect(h2!.margin, 'preflight must zero heading margins, or the card headers moved').toBe('0px 0px 0px 0px')
  expect(h2!.fontSize, 'text-sm, not a browser heading size').toBe('14px')
  expect(h2!.fontWeight, 'font-medium, not a browser heading weight').toBe('500')

  // ── sr-only spans cost no layout ────────────────────────────────────────
  const sr = await page.evaluate(() => {
    const el = document.querySelector('a[href*="/visitors/"] .sr-only') as HTMLElement | null
    if (!el) return null
    const s = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    return { position: s.position, w: Math.round(r.width), h: Math.round(r.height), clip: s.clip }
  })
  expect(sr, 'the row must carry visually-hidden text').not.toBeNull()
  note(`SR-ONLY COMPUTED: ${JSON.stringify(sr)}`)
  expect(sr!.position, 'absolute, so it is out of flow').toBe('absolute')
  expect(sr!.w, 'clipped to 1px, so it cannot widen the numeral column').toBeLessThanOrEqual(1)

  // ── the month ribbon's text equivalent, on a real visitor ───────────────
  const href = await page.evaluate(() =>
    (document.querySelector('a[href*="/visitors/"]') as HTMLAnchorElement | null)?.getAttribute('href') ?? null)
  await page.goto(`${BASE}${href}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3000)
  const ribbon = await page.evaluate(() => {
    const el = document.querySelector('[role="img"]')
    return el ? el.getAttribute('aria-label') : null
  })
  expect(ribbon, 'the ribbon must be a labelled graphic').toBeTruthy()
  note(`RIBBON LABEL: "${ribbon}"`)
  expect(ribbon!).toMatch(/day by day/)

  await page.screenshot({ path: `${OUT}/verify-roster.png` })
  note(JSON.stringify(log, null, 1))
})

// ═══════════════════════════════════════════════════════════════════════════
// Round 5 / 5b as built — the four decisions, on the deployed page.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fail with the TRUE reason when the deployed build predates the change.
 *
 * 🔴 This ran once against a staging deploy whose pipeline was still going, and
 * reported four separate failures — "the field must draw far more than the roster
 * page", "the identity column must no longer be crushed to 47px" — every one of
 * which reads as a broken feature rather than as absent code. `kubectl rollout
 * status` had returned success, because it answers "is the CURRENT rollout
 * complete?", not "has my code shipped?".
 *
 * `data-visitor-dot` exists only in the new build, so its absence is the honest
 * message, delivered once, before anything else is measured.
 */
async function expectBuildDeployed(page: Page) {
  const dots = await page.evaluate(() => document.querySelectorAll('[data-visitor-dot]').length)
  expect(dots,
    'the deployed build PREDATES this change — no [data-visitor-dot] on the page. ' +
    'Wait for the staging deploy pipeline, not for `kubectl rollout status`.',
  ).toBeGreaterThan(0)
}

test('§1 — the field draws the range, admits the rest, and marks the reset', async ({ page }) => {
  test.setTimeout(4 * 60 * 1000)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await openRoster(page)
  await page.waitForTimeout(2500)
  await expectBuildDeployed(page)

  const field = await page.evaluate(() => {
    const dots = [...document.querySelectorAll('[data-visitor-dot]')]
    const caption = [...document.querySelectorAll('p')].find((p) =>
      (p.textContent || '').includes('Each dot is one visitor'))
    const boundary = [...document.querySelectorAll('span')].find((s) =>
      /identities reset/.test(s.textContent || ''))
    const stats = [...document.querySelectorAll('p')].find((p) =>
      /visitors this range/.test(p.textContent || ''))
    return {
      dots: dots.length,
      caption: caption?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
      boundary: boundary?.textContent?.trim() ?? null,
      stats: stats?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
      rows: document.querySelectorAll('a[href*="/visitors/"]').length,
    }
  })
  note(`§1 FIELD: dots=${field.dots} rows=${field.rows}`)
  note(`§1 CAPTION: "${field.caption}"`)
  note(`§1 BOUNDARY: "${field.boundary}"`)
  note(`§1 STATS: "${field.stats}"`)

  // The defect: ten dots under a caption saying "every visitor in range".
  expect(field.rows, 'the roster still pages at 10').toBeLessThanOrEqual(10)
  expect(field.dots, 'the field must draw far more than the roster page').toBeGreaterThan(50)
  expect(field.caption, 'the caption must admit what is not drawn').toMatch(/more not drawn/)
  expect(field.boundary, 'the month boundary must be labelled').toMatch(/identities reset/)

  // 🔑 The numbers on one screen must agree: dots + undrawn == the range total.
  const total = Number((field.stats ?? '').match(/^(\d+) visitors this range/)?.[1] ?? -1)
  const undrawn = Number((field.caption ?? '').match(/(\d+) more not drawn/)?.[1] ?? -1)
  note(`§1 ARITHMETIC: ${field.dots} drawn + ${undrawn} undrawn = ${field.dots + undrawn}, total ${total}`)
  expect(field.dots + undrawn, 'drawn + undrawn must equal the range total the stats line prints').toBe(total)

  await page.screenshot({ path: `${OUT}/verify-1-field.png` })
})

test('§3 — hovering a roster row lights that visitor’s dot', async ({ page }) => {
  test.setTimeout(4 * 60 * 1000)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await openRoster(page)
  await page.waitForTimeout(2500)
  await expectBuildDeployed(page)

  // No labels at all — that is what removed the displacement bug.
  const labels = await page.evaluate(() =>
    [...document.querySelectorAll('[data-visitor-dot]')].filter((d) => (d.textContent || '').trim()).length)
  expect(labels, 'the field must draw no pseudonyms').toBe(0)

  const before = await page.evaluate(() =>
    [...document.querySelectorAll('[data-visitor-dot] > span')]
      .filter((s) => s.className.includes('bg-brand-orange')).length)

  // Hover the row and read the field.
  const row = page.locator('a[href*="/visitors/"]').nth(1)
  const key = (await row.getAttribute('href'))!.split('/').pop()!
  await row.hover()
  await page.waitForTimeout(500)

  const lit = await page.evaluate((k) => {
    const d = document.querySelector(`[data-visitor-dot="${k}"] > span`) as HTMLElement | null
    if (!d) return { present: false, orange: false, width: -1 }
    return { present: true, orange: d.className.includes('bg-brand-orange'), width: parseFloat(d.style.width) }
  }, key)
  note(`§3 HOVER key=${key.slice(0, 8)} present=${lit.present} orange=${lit.orange} w=${lit.width}`)
  expect(lit.present, 'the hovered visitor must have a dot in the field').toBeTruthy()
  expect(lit.orange, 'the hovered visitor’s dot must be brand orange').toBeTruthy()

  await page.screenshot({ path: `${OUT}/verify-3-hover.png` })

  // 🔑 FOCUS DOES IT TOO — hover does not exist on a phone.
  await page.mouse.move(0, 0)
  await page.waitForTimeout(400)
  await row.focus()
  await page.waitForTimeout(400)
  const onFocus = await page.evaluate((k) => {
    const d = document.querySelector(`[data-visitor-dot="${k}"] > span`) as HTMLElement | null
    return d ? d.className.includes('bg-brand-orange') : false
  }, key)
  note(`§3 FOCUS lights the same dot: ${onFocus}`)
  expect(onFocus, 'keyboard focus must light the dot as hover does').toBeTruthy()

  // And it goes out again.
  await row.blur()
  await page.waitForTimeout(400)
  const after = await page.evaluate(() =>
    [...document.querySelectorAll('[data-visitor-dot] > span')]
      .filter((s) => s.className.includes('bg-brand-orange')).length)
  expect(after, 'blur must clear the highlight').toBe(before)
})

test('§2 — the roster below sm answers who and when', async ({ page }) => {
  test.setTimeout(4 * 60 * 1000)
  await page.setViewportSize({ width: 375, height: 812 })
  await openRoster(page)
  await page.waitForTimeout(2000)
  await expectBuildDeployed(page)

  const m = await page.evaluate(() => {
    const link = document.querySelector('a[href*="/visitors/"]') as HTMLElement | null
    if (!link) return null
    const identity = link.querySelector('.min-w-0') as HTMLElement | null
    const name = link.querySelector('.truncate') as HTMLElement | null
    const doc = document.scrollingElement || document.documentElement
    return {
      row: Math.round(link.getBoundingClientRect().width),
      identity: identity ? Math.round(identity.getBoundingClientRect().width) : -1,
      nameText: (name?.textContent || '').trim(),
      nameTruncated: name ? name.scrollWidth > name.clientWidth + 1 : false,
      overflow: doc.scrollWidth > doc.clientWidth,
    }
  })
  note(`§2 AT 375: row=${m!.row}px identity=${m!.identity}px name="${m!.nameText}" truncated=${m!.nameTruncated} overflow=${m!.overflow}`)

  // The measured before: identity 47px, name rendered as "Thou…".
  // Measured: 47px before, 199px after. The threshold is deliberately well clear
  // of the old value and well clear of the new one — the PROPERTY that matters is
  // the next assertion (the pseudonym is not truncated); this one only pins that
  // the column stopped being crushed. A threshold set at the measured value would
  // fail on a one-pixel change to an unrelated gap.
  expect(m!.identity, 'the identity column must no longer be crushed to 47px').toBeGreaterThan(150)
  expect(m!.nameTruncated, 'the pseudonym must fit').toBeFalsy()
  expect(m!.overflow, 'and still no horizontal overflow').toBeFalsy()

  // 🔑 THE COLUMNS RETREAT CONSISTENTLY, HEADER AND CELL TOGETHER.
  //
  // `hidden sm:inline-block` is `display:none` below sm, which removes the
  // numerals from the ACCESSIBILITY TREE as well as from the screen. That is the
  // approved design — visits and pages live one click deeper on a phone — and it
  // is only correct if the column HEADERS go with them. A header whose cells are
  // gone is the mirror image of the defect the accessibility pass just fixed:
  // there it was cells with no labels; here it would be labels with no cells.
  const narrow = await page.evaluate(() => {
    const head = [...document.querySelectorAll('button, span')]
      .filter((n) => /^(Visits|Pages)$/.test((n.textContent || '').trim()))
      .filter((n) => getComputedStyle(n).display !== 'none')
      .map((n) => (n.textContent || '').trim())
    const link = document.querySelector('a[href*="/visitors/"]') as HTMLElement | null
    const clone = link?.cloneNode(true) as HTMLElement | undefined
    clone?.querySelectorAll('[aria-hidden="true"]').forEach((n) => n.remove())
    // Anything display:none is out of the tree too — strip it the way the
    // platform would, so this reads what a screen reader would actually get.
    const visible = link
      ? [...link.querySelectorAll<HTMLElement>('*')]
          .filter((n) => getComputedStyle(n).display === 'none')
          .map((n) => (n.textContent || '').trim())
      : []
    return { visibleHeaders: head, hiddenText: visible.join(' | ') }
  })
  note(`§2 HEADERS STILL SHOWN AT 375: ${JSON.stringify(narrow.visibleHeaders)}`)
  note(`§2 HIDDEN CELL TEXT: "${narrow.hiddenText}"`)
  expect(narrow.visibleHeaders,
    'Visits and Pages headers must retreat with their cells — a header with no cells ' +
    'is the mirror of the defect the accessibility pass just fixed').toEqual([])

  await page.screenshot({ path: `${OUT}/verify-2-375.png` })
})

test('§4 — the header drops its dimension line and the card keeps its icons', async ({ page }) => {
  test.setTimeout(4 * 60 * 1000)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await openRoster(page)
  await expectBuildDeployed(page)
  const href = await page.evaluate(() =>
    (document.querySelector('a[href*="/visitors/"]') as HTMLAnchorElement | null)?.getAttribute('href') ?? null)
  await page.goto(`${BASE}${href}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3000)

  const m = await page.evaluate(() => {
    const h1 = document.querySelector('h1')
    const header = h1?.parentElement
    const metaRow = header?.querySelector('div.mt-2')
    // 🔴 THE CARD, NOT ITS HEADER ROW. Filtering divs that contain
    // "first touch · latest observed" matches the whole card AND the h-12 header
    // bar inside it; taking the LAST is the most deeply nested, i.e. the header,
    // which has no icons because the cells are its siblings. Reported
    // "PROFILE ICONS: 0" on a card that was rendering them perfectly.
    const label = [...document.querySelectorAll('span')].find((n) =>
      (n.textContent || '').trim() === 'first touch · latest observed')
    // `border-border` is on the header row too. `bg-card` is only on the card.
    const card = (label?.closest('div.bg-card') as HTMLElement | null) ?? null
    const s = h1 ? getComputedStyle(h1) : null
    return {
      h1Size: s?.fontSize ?? null,
      h1Weight: s?.fontWeight ?? null,
      headerText: (metaRow?.textContent || '').replace(/\s+/g, ' ').trim(),
      // VisitorMeta is the flex-wrap row inside the header meta line.
      headerHasDimensionLine: !!metaRow?.querySelector('div.flex-wrap'),
      cardClass: card ? card.className : null,
      cardIcons: card ? card.querySelectorAll('img, svg').length : -1,
      cardText: card ? (card.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 220) : null,
    }
  })
  note(`§4 H1: ${m.h1Size} / ${m.h1Weight}`)
  note(`§4 HEADER META: "${m.headerText}"`)
  note(`§4 PROFILE CARD CLASS: ${m.cardClass}`)
  note(`§4 PROFILE ICONS: ${m.cardIcons}`)
  note(`§4 PROFILE TEXT: "${m.cardText}"`)

  expect(m.headerHasDimensionLine, 'the dimension line must be gone from the header').toBeFalsy()
  expect(m.headerText, 'the status clause must stay').toMatch(/where they are|Active now|^$/)
  expect(m.h1Size, 'the house title size, text-lg').toBe('18px')
  expect(m.h1Weight, 'font-semibold').toBe('600')

  // 🔑 THE OWNER'S NOTE, AS A CHECK: the card keeps its logos.
  expect(m.cardIcons, 'the Profile card must still carry its icon kit').toBeGreaterThan(2)

  await page.screenshot({ path: `${OUT}/verify-4-detail.png` })
  note(JSON.stringify(log, null, 1))
})
