import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

/**
 * 🔴 ONE MISSING LINE CAUSED THREE BUGS, and the third was destructive.
 *
 * The mount effect seeds every field's STATE from the site and, separately,
 * builds a BASELINE from the same site. `visitor_views_enabled` was added to
 * the baseline and not to the state seeding. On a site with the toggle ON:
 *
 *   1. the switch rendered OFF, contradicting the site;
 *   2. state(false) vs baseline(true) made the tab report "Unsaved changes"
 *      the instant it opened, before anyone touched anything;
 *   3. pressing Save would have written visitor_views_enabled = false and
 *      SILENTLY DISABLED the feature the owner had just turned on.
 *
 * The invariant these pin: state and baseline are seeded from the SAME source,
 * so a freshly-opened tab is never dirty.
 */

vi.mock('@/lib/auth/permissions', () => ({ useCan: () => true }))

// 🔴 The save bar portals into a slot the settings SHELL owns, and returns null
// when there is no slot. Without this mock the bar can never render in a test,
// so "queryByText('Unsaved changes') is null" passes whether the tab is dirty or
// not — a false green that survived the mutation check and had to be caught by
// re-running the mutation, not by reading the test.
vi.mock('@/components/settings/shell-slots', () => ({
  useSaveSlot: () => document.body,
  useHeaderSlot: () => null,
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

const SITE = {
  id: 's1',
  domain: 'ciphera.net',
  name: 'Ciphera',
  collect_page_paths: true,
  collect_referrers: true,
  collect_device_info: true,
  collect_screen_resolution: true,
  collect_audience_data: true,
  collect_geo_data: 'full',
  hide_unknown_locations: false,
  data_retention_months: 36,
  auto_group_dynamic_paths: true,
  page_rules: [],
  allowed_query_params: [],
  // The site under test has visitor views ON — the case that broke.
  visitor_views_enabled: true,
}

vi.mock('@/lib/swr/dashboard', () => ({
  useSite: () => ({ data: SITE, mutate: vi.fn() }),
  useSubscription: () => ({ data: { plan_id: 'business' } }),
  usePerformanceConfig: () => ({ data: { frequency: 'weekly' }, mutate: vi.fn() }),
}))

const updateSite = vi.fn().mockResolvedValue(SITE)
vi.mock('@/lib/api/sites', () => ({ updateSite: (...a: unknown[]) => updateSite(...a) }))
vi.mock('@/lib/api/performance', () => ({ updatePerformanceConfig: vi.fn() }))

beforeEach(() => updateSite.mockClear())

// 🔴 STATIC import, on purpose (06-09-2026). This used to be a dynamic
// `import('../SitePrivacyTab')` INSIDE each test, so the tab's whole module
// graph was transformed inside the test's own 20s budget. On the CI runner —
// where the suite's import phase alone measured 1508s across workers — the
// first test timed out mid-render, its DOM leaked into the next one ("Found
// multiple elements with the text: Visitor-level views"), and the file gated
// deploys of changes that never touched settings (pipelines 1478, 1479).
// vi.mock calls are hoisted above imports, so the mocks still apply.
import SitePrivacyTab from '../SitePrivacyTab'

async function renderTab() {
  return render(<SitePrivacyTab siteId="s1" />)
}

describe('SitePrivacyTab — the visitor-views toggle', () => {
  it('renders the toggle ON for a site whose views are enabled', async () => {
    await renderTab()
    await waitFor(() => expect(screen.getByText('Visitor-level views')).toBeInTheDocument())
    const row = screen.getByText('Visitor-level views').closest('div')?.parentElement
    const toggle = row?.querySelector('[role="switch"], button[aria-checked]')
    // The switch must agree with the site. It rendered OFF before the fix.
    expect(toggle?.getAttribute('aria-checked')).not.toBe('false')
  })

  it('🔴 is NOT dirty on open — state and baseline come from the same source', async () => {
    await renderTab()
    await waitFor(() => expect(screen.getByText('Visitor-level views')).toBeInTheDocument())
    // The save bar only appears when the tab believes something changed. Nothing
    // has been touched, so it must not be there.
    expect(screen.queryByText(/Unsaved changes/i)).toBeNull()
  })

  it('says plainly that the switch does not change collection', async () => {
    await renderTab()
    await waitFor(() =>
      expect(screen.getByText(/Pulse collects the same data either way/)).toBeInTheDocument(),
    )
  })
})
