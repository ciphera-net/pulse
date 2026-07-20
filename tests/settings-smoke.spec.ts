import { test, expect, type Page } from '@playwright/test'
import { login, handleLogin } from './support/login'
import { collectConsoleErrors, type ConsoleErrorCollector } from './support/console-errors'

/**
 * Settings smoke — READ-ONLY authed canary.
 *
 * Logs in once (OPAQUE round-trip via Ciphera ID) and NAVIGATES the settings
 * information architecture: the landing index plus one representative route per
 * top-level section (Site, Organization, the Audit log, Account). For each
 * route it waits for a settings-specific landmark to render and asserts that
 * ZERO error-level console messages were emitted during the load (the only
 * allowlisted error is the documented benign favicon-resolver 404 for
 * id.ciphera.net — see support/console-errors.ts).
 *
 * STRICTLY read-only: this suite only navigates and asserts. It performs NO
 * form submits, saves, creates, updates, or deletes. Pulse staging shares the
 * PRODUCTION database, so any mutation would touch real production data — the
 * suite must never do so.
 *
 * baseURL comes from SMOKE_BASE_URL (default: the pulse-frontend-staging host).
 */

const BASE_URL = process.env.SMOKE_BASE_URL ?? 'https://pulse-staging.ciphera.net'

/** Section routes: one representative tab per top-level settings section. */
const SECTION_ROUTES: { path: string; section: string; label: string }[] = [
  { path: '/settings/site/general', section: 'Site', label: 'Site · General' },
  { path: '/settings/organization/general', section: 'Organization', label: 'Organization · General' },
  { path: '/settings/organization/audit', section: 'Organization', label: 'Organization · Audit Log' },
  { path: '/settings/account/profile', section: 'Account', label: 'Account · Profile' },
]

test.describe.serial('Settings smoke (read-only, authed)', () => {
  let page: Page
  let consoleErrors: ConsoleErrorCollector

  test.beforeAll(async ({ browser }) => {
    // One long-lived context + page so we log in exactly once. The console
    // collector is attached before the first navigation so nothing is missed.
    const context = await browser.newContext()
    page = await context.newPage()
    consoleErrors = collectConsoleErrors(page)
    await login(page, BASE_URL)
  })

  test.afterAll(async () => {
    await page?.context().close()
  })

  /** Reset the per-route error buffer so each test reports only its own load. */
  function beginRoute() {
    consoleErrors.errors.length = 0
  }

  function assertClean(routePath: string) {
    expect(
      consoleErrors.errors,
      `Console errors emitted while loading ${routePath}:\n${consoleErrors.errors.join('\n')}`,
    ).toEqual([])
  }

  test('settings landing renders', async () => {
    beginRoute()
    await page.goto(`${BASE_URL}/settings`)
    await handleLogin(page)

    // Landing has no nav rail; the masthead h1 is "Settings" and the section
    // index panels (Site / Organization / Account) are the stable landmarks.
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible({ timeout: 15_000 })
    expect(new URL(page.url()).pathname).toBe('/settings')

    assertClean('/settings')
  })

  for (const route of SECTION_ROUTES) {
    test(`${route.label} renders`, async () => {
      beginRoute()
      await page.goto(`${BASE_URL}${route.path}`)
      await handleLogin(page)

      // Settings-specific landmark #1: the section masthead <h1>.
      await expect(
        page.getByRole('heading', { level: 1, name: route.section }),
      ).toBeVisible({ timeout: 15_000 })

      // Settings-specific landmark #2: the nav rail's active tab points at the
      // requested route — proves routing resolved to this exact tab inside the
      // settings shell (not a redirect to login or a section default).
      const activeLink = page.locator('nav[aria-label="Settings sections"] a[aria-current="page"]')
      await expect(activeLink).toHaveAttribute('href', route.path)

      expect(new URL(page.url()).pathname).toBe(route.path)

      assertClean(route.path)
    })
  }
})
