import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { QuarantineStats } from '@/lib/api/quarantine'
import * as swr from '@/lib/swr/dashboard'
import { useCan } from '@/lib/auth/permissions'

/**
 * The bot & spam tab, after the 04-09-2026 cut.
 *
 * 🔴 THE OLD SUITE MOSTLY TESTED CONTROLS THAT NO LONGER EXIST. It covered the session-review table
 * and its segmented control, bulk flag-as-bot with its consequence-confirm, the read-only viewer
 * path through those same controls, and the domain-reputation table's Allow / Block / Reset. All
 * five controls were deleted with the sections that held them, so the tests went with them rather
 * than being adapted — a test kept alive against a deleted feature is worse than no test, because
 * it reads as coverage.
 *
 * What survives is what the tab now is: a toggle, three numbers, and the two states a fetch can be
 * in. The load-error case is kept verbatim in spirit, because it guards the property that mattered
 * most on the old page and still matters here — a failed fetch must never read as a clean site.
 */

vi.mock('@/lib/auth/permissions', () => ({ useCan: vi.fn() }))

vi.mock('@/lib/swr/dashboard', () => ({
  useSite: vi.fn(),
  useQuarantineStats: vi.fn(),
}))

vi.mock('@/lib/api/sites', () => ({ updateSite: vi.fn() }))

vi.mock('@ciphera-net/facet', () => ({
  cn: (...a: unknown[]) => a.filter(Boolean).join(' '),
  Toggle: ({ checked, onChange, disabled }: any) => (
    <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={() => onChange?.()} />
  ),
  RailGrid: ({ children }: any) => <div>{children}</div>,
  RailGridTile: ({ children }: any) => <div>{children}</div>,
  toast: { success: vi.fn(), error: vi.fn() },
  getAuthErrorMessage: () => 'error',
}))

import SiteBotSpamTab from '../SiteBotSpamTab'

const mockUseCan = useCan as unknown as ReturnType<typeof vi.fn>
const mockUseSite = swr.useSite as unknown as ReturnType<typeof vi.fn>
const mockUseStats = swr.useQuarantineStats as unknown as ReturnType<typeof vi.fn>

const stats = (over: Partial<QuarantineStats> = {}): QuarantineStats => ({
  total_quarantined: 42,
  by_reason: { a: 1, b: 2 },
  by_method: {},
  last_24h: 7,
  last_7d: 10,
  last_30d: 20,
  ...over,
})

function primeHooks({ statsData = stats(), statsError = undefined as unknown } = {}) {
  mockUseSite.mockReturnValue({ data: { id: 'site-1', name: 'QA Site', filter_bots: true }, mutate: vi.fn() })
  mockUseStats.mockReturnValue({ data: statsError ? undefined : statsData, error: statsError, isLoading: false, mutate: vi.fn() })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUseCan.mockReturnValue(true)
})

describe('SiteBotSpamTab', () => {
  /**
   * The labels name what happened to the customer's NUMBERS, not our mechanism.
   *
   * Renamed 04-09-2026 from "Quarantine activity" / "Quarantined" / "Last 24h" / "Detection types":
   * a site owner does not quarantine anything and has no detection types. The numerals are
   * `tabular-nums`, NOT `font-mono` — this test used to be called "mono numerals", describing a rule
   * the component never broke.
   */
  it('renders the excluded-traffic stats with their customer-facing labels', () => {
    primeHooks()
    render(<SiteBotSpamTab siteId="site-1" />)

    expect(screen.getByText('42')).toBeInTheDocument()
    expect(screen.getByText('7')).toBeInTheDocument()

    expect(screen.getByText('Excluded traffic')).toBeInTheDocument()
    expect(screen.getByText('Excluded from your stats')).toBeInTheDocument()
    expect(screen.getByText('In the last 7 days')).toBeInTheDocument()
    expect(screen.getByText('In the last 24 hours')).toBeInTheDocument()
    // Owner decision 05-09-2026: the family count is gone; the three tiles are one thing at three windows.
    expect(screen.queryByText('Kinds of bot')).not.toBeInTheDocument()
    expect(screen.getByText('10')).toBeInTheDocument() // last_7d from the fixture

    // The old vocabulary must not survive anywhere on the panel.
    expect(screen.queryByText('Quarantine activity')).not.toBeInTheDocument()
    expect(screen.queryByText('Quarantined')).not.toBeInTheDocument()
    expect(screen.queryByText('Detection types')).not.toBeInTheDocument()
  })

  /**
   * 🔴 THE DELETED CONTROLS MUST STAY DELETED, and this is the assertion that says so.
   *
   * Every one of these shipped to customers and was removed on purpose: the session table let a
   * customer read the engine's own suspicion scores, "Flag as bot" wrote a `manual` conviction onto
   * live traffic by hand, and the domain-reputation table asked a site owner to adjudicate referrer
   * domains — a control for which ZERO overrides were ever set, by any customer, on any site, in its
   * entire lifetime. Re-adding one is a decision, not a refactor, and it fails here first.
   */
  it('no longer offers the session table, the manual flag, or the domain overrides', () => {
    primeHooks()
    render(<SiteBotSpamTab siteId="site-1" />)

    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByRole('radiogroup', { name: 'Session view' })).not.toBeInTheDocument()
    for (const gone of ['Session review', 'Domain reputation', 'Flag as bot', 'Unblock', 'Allow', 'Block', 'Reset', 'Suspicious only']) {
      expect(screen.queryByText(gone), `"${gone}" was deleted from this tab`).not.toBeInTheDocument()
    }
  })

  it('renders the toggle from the site and lets a manager change it', () => {
    primeHooks()
    render(<SiteBotSpamTab siteId="site-1" />)

    const toggle = screen.getByRole('switch')
    expect(toggle).toBeChecked()
    expect(toggle).not.toBeDisabled()

    fireEvent.click(toggle)
    expect(screen.getByRole('switch')).not.toBeChecked()
  })

  it('disables the toggle for somebody without quarantine.manage', () => {
    mockUseCan.mockReturnValue(false)
    primeHooks()
    render(<SiteBotSpamTab siteId="site-1" />)
    expect(screen.getByRole('switch')).toBeDisabled()
  })

  /**
   * A failed fetch must read as a SERVER ERROR, never as a clean site. This is the one property the
   * old suite guarded that matters just as much on the smaller page: with the session table gone,
   * these three numerals are the only evidence a customer has that filtering is doing anything, and
   * three silent zeroes would say the opposite of the truth.
   */
  it('surfaces a stats load error distinct from a clean site', () => {
    primeHooks({ statsError: new Error('boom') })
    render(<SiteBotSpamTab siteId="site-1" />)

    expect(screen.getByText(/server error, not a clean site/i)).toBeInTheDocument()
    expect(screen.queryByText('42')).not.toBeInTheDocument()
  })
})
