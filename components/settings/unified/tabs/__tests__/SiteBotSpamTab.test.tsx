import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import type { QuarantineStats, SessionSummary, DomainReputation } from '@/lib/api/quarantine'
import * as swr from '@/lib/swr/dashboard'
import { useCan } from '@/lib/auth/permissions'

// --- Mocks ---------------------------------------------------------------

vi.mock('@/lib/auth/permissions', () => ({ useCan: vi.fn() }))
vi.mock('@/lib/utils/format', () => ({ getDateRange: () => ({ start: '2026-07-11', end: '2026-07-18' }) }))

vi.mock('@/lib/swr/dashboard', () => ({
  useSite: vi.fn(),
  useQuarantineStats: vi.fn(),
  useSessions: vi.fn(),
  useSiteDomainReputation: vi.fn(),
}))

vi.mock('@/lib/api/sites', () => ({ updateSite: vi.fn() }))
vi.mock('@/lib/api/quarantine', () => ({
  quarantineSessions: vi.fn(),
  restoreSessions: vi.fn(),
  createDomainOverride: vi.fn(),
  deleteDomainOverride: vi.fn(),
}))

// Confirm dialog rendered only when open, exposing its confirm button so the
// consequence-confirm flow (bulk flag / domain block) is verifiable.
vi.mock('@/components/ui/ConfirmDialog', () => ({
  ConfirmDialog: ({ open, title, confirmLabel, onConfirm }: any) =>
    open ? (
      <div role="dialog" aria-label={title}>
        <button onClick={onConfirm}>{confirmLabel}</button>
      </div>
    ) : null,
}))

// Lightweight facet stand-ins (audit/billing-test precedent): render real DOM so
// the RuledTable structure, SegmentedControl, Checkbox and Toggle are queryable,
// while StatusChip / SettingsPanel / EmptyRow / RailGrid render for real.
vi.mock('@ciphera-net/facet', () => ({
  cn: (...a: unknown[]) => a.filter(Boolean).join(' '),
  Spinner: () => <div>loading</div>,
  Button: ({ children, variant, ...props }: any) => <button {...props}>{children}</button>,
  Toggle: ({ checked, onChange, disabled }: any) => (
    <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={() => onChange?.()} />
  ),
  Checkbox: ({ checked, onChange, 'aria-label': label }: any) => (
    <input type="checkbox" aria-label={label} checked={checked} onChange={() => onChange?.()} />
  ),
  SegmentedControl: ({ options, value, onChange, 'aria-label': label }: any) => (
    <div role="radiogroup" aria-label={label}>
      {options.map((o: any) => (
        <button key={o.value} aria-pressed={value === o.value} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  ),
  RailGrid: ({ children }: any) => <div>{children}</div>,
  RailGridTile: ({ children }: any) => <div>{children}</div>,
  Table: ({ children, containerClassName, ...props }: any) => <table {...props}>{children}</table>,
  THead: ({ children, ...props }: any) => <thead {...props}>{children}</thead>,
  TBody: ({ children, ...props }: any) => <tbody {...props}>{children}</tbody>,
  TR: ({ children, ...props }: any) => <tr {...props}>{children}</tr>,
  TH: ({ children, numeric, ...props }: any) => <th {...props}>{children}</th>,
  TD: ({ children, numeric, ...props }: any) => <td {...props}>{children}</td>,
  toast: { success: vi.fn(), error: vi.fn() },
  getAuthErrorMessage: () => 'error',
}))

import SiteBotSpamTab from '../SiteBotSpamTab'

const mockUseCan = useCan as unknown as ReturnType<typeof vi.fn>
const mockUseSite = swr.useSite as unknown as ReturnType<typeof vi.fn>
const mockUseStats = swr.useQuarantineStats as unknown as ReturnType<typeof vi.fn>
const mockUseSessions = swr.useSessions as unknown as ReturnType<typeof vi.fn>
const mockUseDomains = swr.useSiteDomainReputation as unknown as ReturnType<typeof vi.fn>

const stats = (over: Partial<QuarantineStats> = {}): QuarantineStats => ({
  total_quarantined: 42,
  by_reason: { a: 1, b: 2 },
  by_method: {},
  last_24h: 7,
  last_7d: 10,
  last_30d: 20,
  ...over,
})

const session = (over: Partial<SessionSummary> = {}): SessionSummary => ({
  session_id: 's1',
  pageviews: 3,
  duration: 12,
  first_page: '/pricing',
  referrer: 'spam.example',
  country: 'US',
  city: 'NYC',
  region: null,
  browser: 'Chrome',
  os: null,
  screen_resolution: null,
  first_seen: '2026-07-15T10:00:00Z',
  quarantined: false,
  suspicion_score: 6,
  ...over,
})

const domain = (over: Partial<DomainReputation> = {}): DomainReputation => ({
  domain: 'spam.example',
  total_events: 100,
  bot_events: 90,
  bot_ratio: 0.9,
  confidence: 'high',
  action: 'quarantine',
  source: 'learned',
  first_seen: '2026-07-01T00:00:00Z',
  last_seen: '2026-07-15T00:00:00Z',
  updated_at: '2026-07-15T00:00:00Z',
  override: null,
  ...over,
})

function primeHooks({
  statsData = stats(),
  statsError = undefined as unknown,
  sessionList = [session(), session({ session_id: 's2', first_page: '/blocked', quarantined: true, suspicion_score: 8 })],
  sessionsError = undefined as unknown,
  domainList = [domain()] as DomainReputation[] | undefined,
} = {}) {
  mockUseSite.mockReturnValue({ data: { id: 'site-1', name: 'QA Site', filter_bots: true }, mutate: vi.fn() })
  mockUseStats.mockReturnValue({ data: statsError ? undefined : statsData, error: statsError, isLoading: false, mutate: vi.fn() })
  mockUseSessions.mockReturnValue({ data: sessionsError ? undefined : { sessions: sessionList }, error: sessionsError, isLoading: false, mutate: vi.fn() })
  mockUseDomains.mockReturnValue({ data: domainList === undefined ? undefined : { domains: domainList }, error: undefined, isLoading: false, mutate: vi.fn() })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUseCan.mockReturnValue(true)
})

describe('SiteBotSpamTab', () => {
  it('renders the detection stats as mono numerals', () => {
    primeHooks()
    render(<SiteBotSpamTab siteId="site-1" />)
    expect(screen.getByText('42')).toBeInTheDocument()
    expect(screen.getByText('7')).toBeInTheDocument()
    // Detection types = keys of by_reason (a, b) = 2.
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('Last 24h')).toBeInTheDocument()
    expect(screen.getByText('Detection types')).toBeInTheDocument()
  })

  it('shows suspicious sessions in the review view and switches to quarantined', () => {
    primeHooks()
    render(<SiteBotSpamTab siteId="site-1" />)

    const table = screen.getByRole('table', { name: 'Session review' })
    expect(within(table).getByText('/pricing')).toBeInTheDocument()
    expect(within(table).queryByText('/blocked')).not.toBeInTheDocument()
    // Manager sees the mutate action.
    expect(within(table).getByRole('button', { name: 'Flag as bot' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Quarantined' }))
    const after = screen.getByRole('table', { name: 'Session review' })
    expect(within(after).getByText('/blocked')).toBeInTheDocument()
    expect(within(after).queryByText('/pricing')).not.toBeInTheDocument()
    expect(within(after).getByRole('button', { name: 'Unblock' })).toBeInTheDocument()
  })

  it('keeps quarantine.view read-only: no selection or mutate controls for viewers', () => {
    mockUseCan.mockReturnValue(false)
    primeHooks()
    render(<SiteBotSpamTab siteId="site-1" />)

    const sessionTable = screen.getByRole('table', { name: 'Session review' })
    expect(within(sessionTable).getByText('/pricing')).toBeInTheDocument()
    expect(within(sessionTable).queryByRole('button', { name: 'Flag as bot' })).not.toBeInTheDocument()
    expect(within(sessionTable).queryByRole('checkbox')).not.toBeInTheDocument()

    const domainTable = screen.getByRole('table', { name: 'Domain reputation' })
    expect(within(domainTable).queryByRole('button', { name: 'Allow' })).not.toBeInTheDocument()
    expect(within(domainTable).queryByRole('button', { name: 'Block' })).not.toBeInTheDocument()
    // The bot-filtering toggle is present but disabled for a viewer (the
    // suspicious-only view filter stays enabled, so assert the disabled one exists).
    const disabledSwitch = screen.getAllByRole('switch').find(el => (el as HTMLInputElement).disabled)
    expect(disabledSwitch).toBeTruthy()
  })

  it('requires a consequence-confirm before flagging selected sessions as bot', () => {
    primeHooks()
    render(<SiteBotSpamTab siteId="site-1" />)

    // Select the visible suspicious session → bulk bar appears.
    const table = screen.getByRole('table', { name: 'Session review' })
    fireEvent.click(within(table).getByRole('checkbox', { name: 'Select session /pricing' }))
    expect(screen.getByText('1 selected')).toBeInTheDocument()

    // Bulk "Flag as bot" (rendered in the bulk bar above the table, so it is the
    // first match) opens the confirm dialog rather than mutating directly — the
    // per-row action flags immediately, only bulk reclassification confirms.
    const bulkFlag = screen.getAllByRole('button', { name: 'Flag as bot' })[0]
    fireEvent.click(bulkFlag)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('opens a block confirm from the domain row', () => {
    primeHooks()
    render(<SiteBotSpamTab siteId="site-1" />)

    const domainTable = screen.getByRole('table', { name: 'Domain reputation' })
    expect(within(domainTable).getByText('spam.example')).toBeInTheDocument()
    fireEvent.click(within(domainTable).getByRole('button', { name: 'Block' }))
    expect(screen.getByRole('dialog', { name: 'Block this domain?' })).toBeInTheDocument()
  })

  it('surfaces a stats load error distinct from a clean site', () => {
    primeHooks({ statsError: new Error('boom') })
    render(<SiteBotSpamTab siteId="site-1" />)
    expect(screen.getByText(/server error, not a clean site/i)).toBeInTheDocument()
  })

  it('surfaces a sessions load error instead of an empty result', () => {
    primeHooks({ sessionsError: new Error('boom') })
    render(<SiteBotSpamTab siteId="site-1" />)
    expect(screen.getByText(/server error, not an empty result/i)).toBeInTheDocument()
    expect(screen.queryByText('No suspicious sessions found')).not.toBeInTheDocument()
  })

  it('renders the in-frame empty state when there are no domains', () => {
    primeHooks({ domainList: [] })
    render(<SiteBotSpamTab siteId="site-1" />)
    expect(screen.getByText('No domain data yet')).toBeInTheDocument()
  })
})
