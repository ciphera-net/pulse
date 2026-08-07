import { expect, test } from '@playwright/test'
import { login } from './support/login'

const BASE_URL = process.env.SMOKE_BASE_URL ?? 'https://pulse-staging.ciphera.net'

// Saving site settings is the write path that migration 114 constrains.
//
// The settings smoke suite is read-only: it asserts the shell renders. That is
// exactly the shape of check that let "migrations never ran on deploy" reach
// production — every assertion covered a layer adjacent to the broken one. A
// NOT NULL + CHECK (timezone <> '') on sites is only safe if no save can send an
// empty timezone, and the only way to know is to save.
//
// This test PUTs a real update and asserts the response, not the chrome.
test.describe('Site settings save (write path)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, BASE_URL)
  })

  test('saving Site · General succeeds and never blanks the timezone', async ({ page }) => {
    await page.goto(`${BASE_URL}/settings/site/general`)
    await page.waitForLoadState('networkidle')

    // Capture the site update response rather than trusting the UI's own
    // success state — a 500 with a toast swallowed would look like success.
    const responses: { status: number; body: string; sentTimezone: unknown }[] = []
    page.on('response', async (res) => {
      const req = res.request()
      if (req.method() !== 'PUT' || !/\/api\/v1\/sites\//.test(res.url())) return
      let sentTimezone: unknown = '<unparsed>'
      try {
        sentTimezone = JSON.parse(req.postData() ?? '{}').timezone
      } catch {
        /* keep the placeholder */
      }
      responses.push({
        status: res.status(),
        body: (await res.text().catch(() => '')).slice(0, 300),
        sentTimezone,
      })
    })

    // "Save changes" only appears once the form is dirty, so the field has to be
    // edited BEFORE the button can be located. Edit, save, restore, save again —
    // two real PUTs, leaving the site exactly as it was found.
    const name = page.getByRole('textbox', { name: 'Name' })
    await expect(name).toBeVisible({ timeout: 15_000 })
    const original = await name.inputValue()

    const save = page.getByRole('button', { name: /save changes/i })

    await name.fill(`${original} (probe)`)
    await expect(save).toBeVisible({ timeout: 10_000 })
    await save.click()
    await expect
      .poll(() => responses.length, { timeout: 20_000 })
      .toBeGreaterThan(0)

    await name.fill(original)
    await expect(save).toBeVisible({ timeout: 10_000 })
    await save.click()
    await page.waitForTimeout(2_000)

    // The site name must end up exactly as it started.
    await page.reload()
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue(original)

    for (const r of responses) {
      // A 500 here is the exact failure mode the constraint could have caused:
      // the client sends timezone:"" and Postgres rejects the row.
      expect(
        r.status,
        `site update returned ${r.status} (sent timezone=${JSON.stringify(r.sentTimezone)}): ${r.body}`,
      ).toBeLessThan(400)
    }
  })
})
