/**
 * WS4 tour AUDIT — measure the deployed tour, don't eyeball it.
 *
 * Owner reports: (1) a step whose target doesn't exist for some users,
 * (2) the popover covering what it points at, (3) the ring intermittently
 * invisible. Per viewport × step this captures: target/stage/popover rects,
 * popover∩stage overlap, whether driver fell back to its dummy element,
 * time-to-popover, and a full screenshot for a ring-pixel pass (outlines are
 * clipped by ancestor overflow — the deck Card is overflow-hidden — so ring
 * visibility can only be judged from rendered pixels).
 *
 * Plus one forced probe: hide a step's target mid-tour and record exactly
 * what a missing-anchor user experiences (hang length, dummy fallback,
 * centered popover).
 */
import { test, expect } from '@playwright/test'
import { login } from './support/login'
import * as fs from 'fs'

const BASE = process.env.SMOKE_BASE_URL ?? 'https://pulse.ciphera.net'
const OUT = process.env.SHOT_DIR ?? '.'

const VIEWPORTS = [
  { w: 1440, h: 1000 },
  { w: 1280, h: 800 },
  { w: 1024, h: 768 },
  { w: 800, h: 900 },
]

const STEP_TITLES = [
  'Your key metrics', 'The chart', 'Break it down', 'Pick your window',
  'Right now', 'Alerts land here', 'More than the dashboard',
]

interface StepMeasure {
  viewport: string
  step: string
  msToPopover: number
  dummy: boolean
  target: { x: number; y: number; w: number; h: number } | null
  stage: { x: number; y: number; w: number; h: number } | null
  popover: { x: number; y: number; w: number; h: number }
  overlapPctOfStage: number
  targetVisibleInViewport: boolean
  shot: string
}

test.setTimeout(900_000)

test('audit the deployed tour', async ({ browser }) => {
  const report: { steps: StepMeasure[]; probe: Record<string, unknown> } = { steps: [], probe: {} }

  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.w, height: vp.h },
      colorScheme: 'dark',
      serviceWorkers: 'block',
    })
    const page = await ctx.newPage()
    await login(page, BASE)
    await page.goto(`${BASE}/sites`)
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.waitForTimeout(2500)
    const sitePath = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a[href^="/sites/"]'))
        .map((a) => a.getAttribute('href') || '')
        .filter((h) => /^\/sites\/[0-9a-f-]{36}$/.test(h))
      return links[0] ?? null
    })
    expect(sitePath, `no site link at ${vp.w}`).toBeTruthy()
    const cookies = await ctx.cookies()
    const sub = JSON.parse(
      Buffer.from(cookies.find((c) => c.name === 'access_token')!.value.split('.')[1], 'base64').toString()
    ).sub as string
    await page.evaluate((s) => {
      localStorage.removeItem(`pulse_tour_done_${s}`)
      localStorage.removeItem('pulse_sidebar_collapsed')
      localStorage.setItem('pulse_sidebar_collapsed', 'true') // worst-case: tour expands it
    }, sub)
    await page.goto(`${BASE}${sitePath}`)

    const popover = page.locator('.driver-popover.pulse-tour')
    await expect(popover).toBeVisible({ timeout: 90_000 })
    await expect(popover.locator('.driver-popover-title')).toHaveText('Welcome to Pulse')

    for (let i = 0; i < STEP_TITLES.length; i++) {
      const t0 = Date.now()
      await popover.locator('.driver-popover-next-btn').click()
      await expect(popover.locator('.driver-popover-title')).toHaveText(STEP_TITLES[i], { timeout: 30_000 })
      const msToPopover = Date.now() - t0
      await page.waitForTimeout(600) // transition settle
      const m = await page.evaluate(() => {
        const pop = document.querySelector('.driver-popover') as HTMLElement
        const target = document.querySelector('.driver-active-element') as HTMLElement | null
        const p = pop.getBoundingClientRect()
        const dummy = !!target && target.id === 'driver-dummy-element'
        let tr: DOMRect | null = null
        let stage: { x: number; y: number; w: number; h: number } | null = null
        let overlapPctOfStage = 0
        let targetVisibleInViewport = false
        if (target && !dummy) {
          tr = target.getBoundingClientRect()
          const PAD = 7
          stage = { x: tr.x - PAD, y: tr.y - PAD, w: tr.width + PAD * 2, h: tr.height + PAD * 2 }
          const ix = Math.max(0, Math.min(p.right, stage.x + stage.w) - Math.max(p.left, stage.x))
          const iy = Math.max(0, Math.min(p.bottom, stage.y + stage.h) - Math.max(p.top, stage.y))
          overlapPctOfStage = Math.round(((ix * iy) / (stage.w * stage.h)) * 100)
          targetVisibleInViewport =
            tr.bottom > 0 && tr.top < window.innerHeight && tr.right > 0 && tr.left < window.innerWidth
        }
        return {
          dummy,
          target: tr ? { x: Math.round(tr.x), y: Math.round(tr.y), w: Math.round(tr.width), h: Math.round(tr.height) } : null,
          stage: stage ? { x: Math.round(stage.x), y: Math.round(stage.y), w: Math.round(stage.w), h: Math.round(stage.h) } : null,
          popover: { x: Math.round(p.x), y: Math.round(p.y), w: Math.round(p.width), h: Math.round(p.height) },
          overlapPctOfStage,
          targetVisibleInViewport,
        }
      })
      const shot = `audit-${vp.w}-s${i + 1}.png`
      await page.screenshot({ path: `${OUT}/${shot}` })
      report.steps.push({ viewport: `${vp.w}x${vp.h}`, step: STEP_TITLES[i], msToPopover, shot, ...m })
    }
    // End the tour cleanly (Done).
    await popover.locator('.driver-popover-next-btn').click().catch(() => {})
    await ctx.close()
  }

  // ── Probe: what does a user with a MISSING step target experience? ──
  {
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      colorScheme: 'dark',
      serviceWorkers: 'block',
    })
    const page = await ctx.newPage()
    await login(page, BASE)
    await page.goto(`${BASE}/sites`)
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.waitForTimeout(2500)
    const sitePath = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a[href^="/sites/"]'))
        .map((a) => a.getAttribute('href') || '')
        .filter((h) => /^\/sites\/[0-9a-f-]{36}$/.test(h))
      return links[0] ?? null
    })
    const cookies = await ctx.cookies()
    const sub = JSON.parse(
      Buffer.from(cookies.find((c) => c.name === 'access_token')!.value.split('.')[1], 'base64').toString()
    ).sub as string
    await page.evaluate((s) => localStorage.removeItem(`pulse_tour_done_${s}`), sub)
    await page.goto(`${BASE}${sitePath}`)
    const popover = page.locator('.driver-popover.pulse-tour')
    await expect(popover).toBeVisible({ timeout: 90_000 })
    // Into step 2, then hide step 3's target before advancing.
    await popover.locator('.driver-popover-next-btn').click()
    await expect(popover.locator('.driver-popover-title')).toHaveText('Your key metrics')
    await popover.locator('.driver-popover-next-btn').click()
    await expect(popover.locator('.driver-popover-title')).toHaveText('The chart')
    await page.evaluate(() => {
      const el = document.querySelector('[data-tour="dimension-card"][data-tour-card="referrers"]') as HTMLElement
      el.style.display = 'none'
    })
    const t0 = Date.now()
    await popover.locator('.driver-popover-next-btn').click()
    // Post-fix semantics: a mid-tour hidden target gets driver's short grace
    // (waitForElement 2500) and is then SKIPPED — the next title is step 4's.
    await expect(popover.locator('.driver-popover-title')).toHaveText('Pick your window', { timeout: 30_000 })
    const ms = Date.now() - t0
    await page.waitForTimeout(400)
    const state = await page.evaluate(() => {
      const target = document.querySelector('.driver-active-element')
      const pop = document.querySelector('.driver-popover') as HTMLElement
      const p = pop.getBoundingClientRect()
      return {
        dummy: !!target && target.id === 'driver-dummy-element',
        targetTag: target?.tagName ?? null,
        popCenteredX: Math.abs(p.x + p.width / 2 - window.innerWidth / 2) < 60,
        popCenteredY: Math.abs(p.y + p.height / 2 - window.innerHeight / 2) < 120,
      }
    })
    await page.screenshot({ path: `${OUT}/audit-probe-missing.png` })
    report.probe = { msWaitedForMissingTarget: ms, ...state }
    await ctx.close()
  }

  fs.writeFileSync(`${OUT}/audit-report.json`, JSON.stringify(report, null, 1))
  console.log('WS4_AUDIT_DONE', JSON.stringify(report.probe))
})
