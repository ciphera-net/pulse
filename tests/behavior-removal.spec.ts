import { test, expect } from '@playwright/test'
import { login } from './support/login'
import { collectConsoleErrors } from './support/console-errors'

/**
 * Post-removal verification for the Behavior page retirement
 * (Pulse/docs/plans/14-08-2026-behavioral-tracking-removal.md).
 *
 * Everything else about this change was verifiable from outside — routes 404,
 * scripts stop being served, tests pass. The one thing that was NOT was how the
 * relocated scroll-depth panel actually renders on the authed dashboard, because
 * every site route bounces to login from an unauthenticated fetch. That is what
 * this spec covers.
 *
 * It asserts BOTH directions on purpose: the Behavior surface is gone AND scroll
 * depth survived. Either alone would be a misleading pass — a build that dropped
 * both would satisfy "Behavior is gone".
 */

const BASE_URL = process.env.SMOKE_BASE_URL ?? 'https://pulse-staging.ciphera.net'

test.describe('behavior page removal', () => {
  test('dashboard renders scroll depth; Behavior surface is gone', async ({ page }) => {
    const consoleErrors = collectConsoleErrors(page)
    await login(page, BASE_URL)

    // Land on the sites list and open the first site.
    await page.goto(`${BASE_URL}/sites`)
    await page.waitForLoadState('networkidle').catch(() => {})

    const siteLink = page.locator('a[href^="/sites/"]').first()
    await expect(siteLink).toBeVisible({ timeout: 30_000 })
    const href = await siteLink.getAttribute('href')
    const siteId = (href ?? '').split('/')[2]
    expect(siteId, 'could not resolve a site id from the sites list').toBeTruthy()

    // ---- The dashboard ----
    await page.goto(`${BASE_URL}/sites/${siteId}`)
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.waitForTimeout(3000)

    // Scroll depth SURVIVED and is on the dashboard now.
    const scrollPanel = page.getByText('Scroll depth', { exact: true })
    await expect(scrollPanel, 'scroll-depth panel missing from the dashboard').toBeVisible({
      timeout: 30_000,
    })
    await scrollPanel.scrollIntoViewIfNeeded()
    await page.waitForTimeout(500)
    await page.screenshot({ path: 'test-results/dashboard-scroll-depth.png', fullPage: true })

    // The sidebar must no longer offer Behavior.
    const behaviorNav = page.locator(`a[href="/sites/${siteId}/behavior"]`)
    await expect(behaviorNav, 'sidebar still links to the deleted Behavior page').toHaveCount(0)

    // Positive control for that assertion: a nav entry that SHOULD still exist.
    // Without this, "no Behavior link" also passes if the sidebar failed to render.
    const journeysNav = page.locator(`a[href="/sites/${siteId}/journeys"]`)
    await expect(journeysNav, 'sidebar did not render at all').toHaveCount(1)

    // ---- The retired route ----
    const resp = await page.goto(`${BASE_URL}/sites/${siteId}/behavior`)
    expect(resp?.status(), 'the retired Behavior route should 404 for an authed user').toBe(404)
    await page.screenshot({ path: 'test-results/behavior-404.png', fullPage: true })

    // ---- No add-on script on the app itself ----
    const html = await page.content()
    expect(html).not.toContain('script.frustration.js')
    expect(html).not.toContain('script.interactions.js')

    // The 404 above is deliberate, and a 404 navigation emits a console error by
    // definition — so asserting an empty list here would fail on the very thing the
    // test proves. The pre-login /auth/user/me 401 is the same: it is how the app
    // discovers it is unauthenticated. Filter exactly those two and assert the rest.
    const unexpected = consoleErrors.errors.filter(
      (e) => !/\/behavior:0/.test(e) && !/auth\/user\/me/.test(e),
    )
    expect(unexpected, 'unexpected console errors during the run').toEqual([])
  })

  test('scroll-depth panel renders its rails when data is present', async ({ page }) => {
    // Staging has one site and it has no scroll data, so the run above could only
    // ever show the empty state. That proves placement, not rendering. Intercepting
    // the dashboard response exercises the real component inside the real page
    // layout with real data shape — without seeding a database.
    await login(page, BASE_URL)

    await page.goto(`${BASE_URL}/sites`)
    await page.waitForLoadState('networkidle').catch(() => {})
    const href = await page.locator('a[href^="/sites/"]').first().getAttribute('href')
    const siteId = (href ?? '').split('/')[2]

    await page.route('**/api/v1/sites/*/dashboard*', async (route) => {
      const resp = await route.fetch()
      let body: Record<string, unknown>
      try {
        body = await resp.json()
      } catch {
        return route.fulfill({ response: resp })
      }
      body.scroll_depth = {
        scroll_25: 810,
        scroll_50: 470,
        scroll_75: 230,
        scroll_100: 90,
        total_sessions: 1000,
      }
      await route.fulfill({ response: resp, body: JSON.stringify(body) })
    })

    await page.goto(`${BASE_URL}/sites/${siteId}`)
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.waitForTimeout(3000)

    const panel = page.getByText('Scroll depth', { exact: true })
    await expect(panel).toBeVisible({ timeout: 30_000 })
    await panel.scrollIntoViewIfNeeded()
    await page.waitForTimeout(800)

    // All four rails present, and the empty state gone.
    for (const label of ['25%', '50%', '75%', '100%']) {
      await expect(page.getByText(label).first()).toBeVisible()
    }
    await expect(page.getByText('No scrolls recorded yet')).toHaveCount(0)

    await page.screenshot({ path: 'test-results/dashboard-scroll-depth-populated.png', fullPage: true })
  })
})
