import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import type { QuarantineStats } from '@/lib/api/quarantine'
import * as swr from '@/lib/swr/dashboard'
import { useCan } from '@/lib/auth/permissions'

/**
 * The bot and spam tab, after the 04-09-2026 cut and the 16-09-2026 chrome rebuild.
 *
 * THE OLD SUITE MOSTLY TESTED CONTROLS THAT NO LONGER EXIST. It covered the session review table
 * and its segmented control, bulk flag as bot with its consequence confirm, the read only viewer
 * path through those same controls, and the domain reputation table's Allow / Block / Reset. All
 * five controls were deleted with the sections that held them, so the tests went with them rather
 * than being adapted, a test kept alive against a deleted feature is worse than no test, because
 * it reads as coverage.
 *
 * What survives is what the tab now is: a toggle, three numbers, and the states each of its two
 * fetches can be in. The load error case is kept verbatim in spirit, because it guards the property
 * that mattered most on the old page and still matters here: a failed fetch must never read as a
 * clean site. It is now joined by the site level fetch's own error state, which the pre-rebuild tab
 * never surfaced at all (an SWR error that fell through to an infinite skeleton).
 */

vi.mock('@/lib/auth/permissions', () => ({ useCan: vi.fn() }))

vi.mock('@/lib/swr/dashboard', () => ({
  useSite: vi.fn(),
  useQuarantineStats: vi.fn(),
}))

vi.mock('@/lib/api/sites', () => ({ updateSite: vi.fn() }))

vi.mock('@ciphera-net/facet', () => ({
  cn: (...a: unknown[]) => a.filter(Boolean).join(' '),
  // Facet Button; `asChild` hands the classes to its child (a Link), so the
  // rendered element stays an anchor. SettingsErrorState renders through this.
  Button: ({ children, asChild, ...props }: any) => (asChild ? children : <button {...props}>{children}</button>),
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

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

const SOURCE_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'SiteBotSpamTab.tsx',
)

const siteMutate = vi.fn()

function primeHooks({
  statsData = stats(),
  statsError = undefined as unknown,
  siteError = undefined as unknown,
} = {}) {
  mockUseSite.mockReturnValue({
    data: siteError ? undefined : { id: 'site-1', name: 'QA Site', filter_bots: true },
    error: siteError,
    mutate: siteMutate,
  })
  mockUseStats.mockReturnValue({ data: statsError ? undefined : statsData, error: statsError, isLoading: false, mutate: vi.fn() })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUseCan.mockReturnValue(true)
})

describe('SiteBotSpamTab', () => {
  /**
   * The labels name what happened to the customer's numbers, not our mechanism.
   *
   * Renamed 04-09-2026 from "Quarantine activity" / "Quarantined" / "Last 24h" / "Detection types":
   * a site owner does not quarantine anything and has no detection types. The numerals are
   * `tabular-nums`, NOT `font-mono`, this test used to be called "mono numerals", describing a rule
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
   * THE DELETED CONTROLS MUST STAY DELETED, and this is the assertion that says so.
   *
   * Every one of these shipped to customers and was removed on purpose: the session table let a
   * customer read the engine's own suspicion scores, "Flag as bot" wrote a `manual` conviction onto
   * live traffic by hand, and the domain reputation table asked a site owner to adjudicate referrer
   * domains, a control for which ZERO overrides were ever set, by any customer, on any site, in its
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
   * A failed stats fetch must read as a SERVER ERROR, never as a clean site. This is the one
   * property the old suite guarded that matters just as much on the smaller page: with the session
   * table gone, these three numerals are the only evidence a customer has that filtering is doing
   * anything, and three silent zeroes would say the opposite of the truth.
   */
  it('surfaces a stats load error distinct from a clean site', () => {
    primeHooks({ statsError: new Error('boom') })
    render(<SiteBotSpamTab siteId="site-1" />)

    expect(screen.getByRole('alert')).toHaveTextContent(/server error, not a clean site/i)
    expect(screen.queryByText('42')).not.toBeInTheDocument()
  })

  /**
   * The rebuild's own new finding: the pre-rebuild tab destructured only `{ data }` from `useSite`
   * and let a failed site fetch fall through to `SettingsLoadingState` forever, an infinite spinner
   * standing in for a server error. `useSite`'s `error` is now read and answered with the named
   * SettingsErrorState, and Retry re-issues the same `mutate()` the rest of the tab already used.
   */
  it('surfaces a site load error, named, with a working retry, instead of spinning forever', () => {
    primeHooks({ siteError: new Error('boom') })
    render(<SiteBotSpamTab siteId="site-1" />)

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent("Couldn't load bot and spam settings")
    // Neither panel exists while the site itself never loaded.
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    expect(screen.queryByText('Excluded traffic')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(siteMutate).toHaveBeenCalledTimes(1)
  })

  /**
   * Every SettingsPanel title on this tab renders the way the dashboard titles a section: a real
   * level-2 heading, sentence case, no uppercase kicker. The local `SectionLabel` this tab used to
   * hand-roll for "Excluded traffic" rendered an uppercase `<p>`, not a heading at all, so a screen
   * reader's heading list skipped straight from "Filtering" to whatever came after this tab.
   */
  it('titles both panels the way the dashboard titles a section, sentence case, no kicker', () => {
    primeHooks()
    render(<SiteBotSpamTab siteId="site-1" />)

    const filtering = screen.getByRole('heading', { level: 2, name: 'Filtering' })
    expect(filtering.className).toMatch(/\btext-sm\b/)
    expect(filtering.className).toMatch(/\bfont-semibold\b/)
    expect(filtering.className).not.toMatch(/uppercase|micro-label/)

    const excluded = screen.getByRole('heading', { level: 2, name: 'Excluded traffic' })
    expect(excluded.className).toMatch(/\btext-sm\b/)
    expect(excluded.className).not.toMatch(/uppercase|micro-label/)

    expect(
      screen.getByText('Filters bot traffic and referrer spam out of your analytics automatically.'),
    ).toBeInTheDocument()
    expect(screen.getByText('How much traffic bot filtering has kept out of your stats.')).toBeInTheDocument()
  })

  it('renders the site-level skeleton as a status region while the site is loading', () => {
    mockUseSite.mockReturnValue({ data: undefined, error: undefined, mutate: siteMutate })
    mockUseStats.mockReturnValue({ data: undefined, error: undefined, isLoading: true, mutate: vi.fn() })
    render(<SiteBotSpamTab siteId="site-1" />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('never uses an em dash, en dash or a literal ellipsis in its user-facing copy', () => {
    // Scoped to string literals, not the whole stripped source: comments are
    // stripped first so a decision note doesn't trip the same copy rule its
    // own quoted strings must obey, and JSX text content outside a quoted
    // string is covered by the rendered-copy assertions above instead.
    const stripped = stripComments(readFileSync(SOURCE_PATH, 'utf8'))
    const stringLiterals = stripped.match(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g) ?? []
    const offenders = stringLiterals.filter(s => /[—–]/.test(s) || /\.\.\./.test(s))
    expect(offenders).toEqual([])
  })
})
