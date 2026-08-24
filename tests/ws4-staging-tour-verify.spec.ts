/**
 * WS4 — verify the deployed product tour on LIVE staging.
 * Real login, real driver.js, real data (the QA site): auto-start with a
 * cleared key, enabled Skip, full 7-step walk, no re-auto-start, ⌘K re-entry.
 */
import { test, expect } from '@playwright/test'
import { login } from './support/login'

const BASE = process.env.SMOKE_BASE_URL ?? 'https://pulse-staging.ciphera.net'
const OUT = process.env.SHOT_DIR ?? '.'

test.setTimeout(420_000)

test('the tour runs on staging', async ({ browser }) => {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    colorScheme: 'dark',
    serviceWorkers: 'block',
  })
  const page = await ctx.newPage()
  await login(page, BASE)

  await page.goto(`${BASE}/sites`)
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(3000)
  const sitePath = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a[href^="/sites/"]'))
      .map((a) => a.getAttribute('href') || '')
      .filter((h) => /^\/sites\/[0-9a-f-]{36}$/.test(h))
    return links[0] ?? null
  })
  expect(sitePath, 'no site link on staging /sites').toBeTruthy()

  // The user id keys the done-flag; read it off the real access token.
  const cookies = await ctx.cookies()
  const access = cookies.find((c) => c.name === 'access_token')
  expect(access, 'no access_token cookie').toBeTruthy()
  const sub = JSON.parse(
    Buffer.from(access!.value.split('.')[1], 'base64').toString()
  ).sub as string

  // Fresh first-run state: clear the key (and any stale request), collapsed rail.
  await page.evaluate((s) => {
    localStorage.removeItem(`pulse_tour_done_${s}`)
    sessionStorage.removeItem('pulse_tour_request')
    localStorage.removeItem('pulse_sidebar_collapsed')
  }, sub)

  await page.goto(`${BASE}${sitePath}`)
  const popover = page.locator('.driver-popover.pulse-tour')
  await expect(popover).toBeVisible({ timeout: 90_000 })
  await expect(popover.locator('.driver-popover-title')).toHaveText('Welcome to Pulse')
  await page.waitForTimeout(550)
  await page.screenshot({ path: `${OUT}/st-0-welcome.jpg`, type: 'jpeg', quality: 85 })

  // Skip is enabled and works.
  const skip = popover.locator('.driver-popover-prev-btn')
  await expect(skip).toHaveText('Skip')
  expect(await skip.evaluate((el) => (el as HTMLButtonElement).disabled)).toBe(false)
  await skip.click()
  await expect(popover).toHaveCount(0)
  const skipped = await page.evaluate((s) => localStorage.getItem(`pulse_tour_done_${s}`), sub)
  expect(skipped, 'Skip did not stamp the done-key').toBeTruthy()

  // Full walk after clearing the key.
  await page.evaluate((s) => localStorage.removeItem(`pulse_tour_done_${s}`), sub)
  await page.reload()
  await expect(popover).toBeVisible({ timeout: 90_000 })
  await popover.locator('.driver-popover-next-btn').click()
  const EXPECTED: Array<[string, string]> = [
    ['Your key metrics', '1 of 7'],
    ['The chart', '2 of 7'],
    ['Break it down', '3 of 7'],
    ['Pick your window', '4 of 7'],
    ['Right now', '5 of 7'],
    ['Alerts land here', '6 of 7'],
    ['More than the dashboard', '7 of 7'],
  ]
  for (let i = 0; i < EXPECTED.length; i++) {
    const [title, progress] = EXPECTED[i]
    await expect(popover.locator('.driver-popover-title')).toHaveText(title)
    await expect(popover.locator('.driver-popover-progress-text')).toHaveText(progress)
    if (i === 2) {
      await page.waitForTimeout(550)
      await page.screenshot({ path: `${OUT}/st-3-card.jpg`, type: 'jpeg', quality: 85 })
    }
    if (i < EXPECTED.length - 1) await popover.locator('.driver-popover-next-btn').click()
  }
  await page.waitForTimeout(550)
  await page.screenshot({ path: `${OUT}/st-7-close.jpg`, type: 'jpeg', quality: 85 })
  await expect(popover.locator('.driver-popover-next-btn')).toHaveText('Done')
  await popover.locator('.driver-popover-next-btn').click()
  await expect(popover).toHaveCount(0)
  const done = await page.evaluate((s) => localStorage.getItem(`pulse_tour_done_${s}`), sub)
  expect(done, 'Done did not stamp the done-key').toBeTruthy()

  // No re-auto-start; ⌘K re-entry works in place.
  await page.reload()
  await page.waitForSelector('[data-tour="metric-rail"]', { timeout: 90_000 })
  await page.waitForTimeout(2500)
  await expect(popover).toHaveCount(0)
  await page.keyboard.press('Meta+k')
  const tourItem = page.getByText('Take the product tour', { exact: true })
  await expect(tourItem).toBeVisible({ timeout: 5000 })
  await tourItem.click()
  await expect(popover).toBeVisible({ timeout: 30_000 })
  await expect(popover.locator('.driver-popover-title')).toHaveText('Welcome to Pulse')
  await page.keyboard.press('Escape')
  await expect(popover).toHaveCount(0)

  console.log('WS4_STAGING_TOUR_VERIFIED')
  await ctx.close()
})
