import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import type { Receipt } from '@/lib/notifications/types'

// --- Mocks ---------------------------------------------------------------

const replace = vi.fn()
let search = new URLSearchParams()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => search,
}))

const useNotifications = vi.fn()
vi.mock('@/lib/hooks/useNotifications', () => ({
  useNotifications: (p: unknown) => useNotifications(p),
}))

vi.mock('@/lib/hooks/useNotificationInbox', () => ({
  NOTIFICATIONS_KEY: 'notifications',
  // The bound-mutate hook (the global-mutate version was the recorded no-op).
  useInvalidateNotifications: () => vi.fn().mockResolvedValue(undefined),
}))

const markAllRead = vi.fn().mockResolvedValue({})
const markRead = vi.fn().mockResolvedValue({})
const purgeMine = vi.fn().mockResolvedValue({})
vi.mock('@/lib/api/notifications-v2', () => ({
  markAllRead: (c?: string) => markAllRead(c),
  markRead: (id: string) => markRead(id),
  purgeMine: () => purgeMine(),
}))

// The page's own useSWR fetches the prefs document (held chip + muted meta).
let prefsDoc: any
vi.mock('swr', () => ({
  __esModule: true,
  default: () => ({ data: prefsDoc }),
}))
vi.mock('@/lib/api/notifications-preferences', () => ({
  getPrefsDocument: vi.fn(),
}))

vi.mock('@/lib/notifications/renderers', () => ({
  renderNotification: (r: Receipt) => ({
    title: `title:${r.event_id}`,
    body: `body:${r.event_id}`,
    linkLabel: 'Open',
  }),
}))
vi.mock('@/lib/notifications/resolvers', () => ({
  useResolveSiteName: () => (id: string) => id,
  useResolveUserName: () => (id: string) => id,
}))
vi.mock('@/lib/utils/notifications', () => ({
  getTypeIcon: () => <span data-testid="type-icon" />,
}))

vi.mock('@ciphera-net/facet', () => ({
  cn: (...a: any[]) => a.flat(Infinity).filter(Boolean).join(' '),
  Modal: ({ isOpen, title, children }: any) =>
    isOpen ? (
      <div role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        {children}
      </div>
    ) : null,
  Input: (props: any) => <input {...props} />,
  toast: { error: vi.fn(), success: vi.fn() },
  getAuthErrorMessage: (e: Error) => e?.message ?? '',
}))

import NotificationsPage from '../page'

// --- Fixtures ------------------------------------------------------------

function receipt(id: string, type: string, createdAt: string, over: Partial<Receipt> = {}): Receipt {
  return {
    user_id: 'u1',
    event_id: id,
    delivered_at: null,
    read_at: null,
    email_status: null,
    email_state_reason: null,
    event: {
      id,
      organization_id: 'org-1',
      type: type as any,
      payload: {} as any,
      link_url: null,
      link_label_key: null,
      created_at: createdAt,
      expires_at: '2027-01-01T00:00:00Z',
    },
    ...over,
  }
}

const COUNTS = {
  billing: { display_name: 'Billing', unread: 1, total: 12 },
  security: { display_name: 'Security', unread: 1, total: 9 },
  uptime: { display_name: 'Uptime', unread: 2, total: 41 },
  site: { display_name: 'Site activity', unread: 1, total: 17 },
  team: { display_name: 'Team', unread: 0, total: 5 },
  system: { display_name: 'System', unread: 0, total: 3 },
}

const now = new Date()
const todayISO = new Date(now.getTime() - 3600 * 1000).toISOString()
const yesterdayISO = new Date(now.getTime() - 26 * 3600 * 1000).toISOString()

function baseHook(over: Record<string, unknown> = {}) {
  return {
    receipts: [
      receipt('r1', 'uptime_monitor_down', todayISO),
      receipt('r2', 'billing_invoice_sent', yesterdayISO, {
        delivered_at: yesterdayISO,
        email_status: 'handed_off',
      }),
    ],
    unreadCount: 5,
    totalCount: 87,
    categoryCounts: COUNTS,
    loading: false,
    error: null,
    refresh: vi.fn(),
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  search = new URLSearchParams()
  prefsDoc = {
    recipient_preferences: { quiet_hours_end: '08:00:00' },
    categories: [{ category_id: 'system', muted: true }],
  }
  useNotifications.mockReturnValue(baseHook())
})

// --- Tests ---------------------------------------------------------------

describe('the Day Register (/notifications, round-3 Direction B)', () => {
  it('renders the tab row with per-tab unread counts and the global edge summary', () => {
    render(<NotificationsPage />)
    expect(screen.getByRole('button', { name: /^All/ })).toBeInTheDocument()
    const uptimeTab = screen.getByRole('button', { name: /Uptime\s*2/ })
    expect(uptimeTab).toBeInTheDocument()
    expect(screen.getByText('5 unread · 87 total')).toBeInTheDocument()
  })

  it('the active tab carries the 3px orange underline; inactive tabs do not', () => {
    render(<NotificationsPage />)
    const underlines = screen.getAllByTestId('active-tab-underline')
    expect(underlines.length).toBe(1)
    expect(underlines[0].className).toContain('h-[3px]')
    expect(underlines[0].className).toContain('bg-brand-orange')
  })

  it('tab counts come from the GLOBAL category_counts, not the filtered list', () => {
    // A filtered view (uptime) still shows every tab's own unread number.
    search = new URLSearchParams('category=uptime')
    useNotifications.mockReturnValue(
      baseHook({ receipts: [receipt('r1', 'uptime_monitor_down', todayISO)] }),
    )
    render(<NotificationsPage />)
    expect(screen.getByRole('button', { name: /Billing\s*1/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Site activity\s*1/ })).toBeInTheDocument()
  })

  it('the controls row carries the FULL registry name and the self-naming mark-read', () => {
    search = new URLSearchParams('category=uptime')
    render(<NotificationsPage />)
    expect(screen.getByRole('button', { name: 'Mark Uptime read' })).toBeInTheDocument()
    expect(screen.getByText('2 unread of 41')).toBeInTheDocument()
  })

  it('mark-read scopes to exactly the active category on the wire', async () => {
    search = new URLSearchParams('category=uptime')
    render(<NotificationsPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Mark Uptime read' }))
    await waitFor(() => expect(markAllRead).toHaveBeenCalledWith('uptime'))
  })

  it('on All, mark-read is unscoped ("Mark all read")', async () => {
    render(<NotificationsPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Mark all read' }))
    await waitFor(() => expect(markAllRead).toHaveBeenCalledWith(undefined))
  })

  it('groups rows by day with day headers and counts', () => {
    render(<NotificationsPage />)
    expect(screen.getByText('Today')).toBeInTheDocument()
    expect(screen.getByText('Yesterday')).toBeInTheDocument()
    expect(screen.getAllByText('1 notification').length).toBe(2)
  })

  it('unread rows carry the orange wash stub; read rows do not', () => {
    useNotifications.mockReturnValue(
      baseHook({
        receipts: [
          receipt('r1', 'uptime_monitor_down', todayISO),
          receipt('r2', 'billing_invoice_sent', yesterdayISO, { read_at: yesterdayISO }),
        ],
      }),
    )
    render(<NotificationsPage />)
    expect(screen.getAllByTestId('unread-stub').length).toBe(1)
  })

  it('"Emailed HH:MM" renders from delivered_at (handed off), never fabricated', () => {
    render(<NotificationsPage />)
    expect(screen.getByText(/^Emailed \d{2}:\d{2}$/)).toBeInTheDocument()
  })

  it('a held email draws the amber chip with the quiet-hours send time', () => {
    useNotifications.mockReturnValue(
      baseHook({
        receipts: [
          receipt('r3', 'site_pagespeed_drop', todayISO, { email_status: 'held' }),
        ],
      }),
    )
    render(<NotificationsPage />)
    expect(screen.getByText('Held — quiet hours · sends 08:00')).toBeInTheDocument()
  })

  it('a muted category’s row reads "Muted — recorded, not alerted"', () => {
    useNotifications.mockReturnValue(
      baseHook({ receipts: [receipt('r4', 'system_announcement', todayISO)] }),
    )
    render(<NotificationsPage />)
    expect(screen.getByText('Muted — recorded, not alerted')).toBeInTheDocument()
  })

  it('expansion marks read exactly once and shows the full body', async () => {
    render(<NotificationsPage />)
    fireEvent.click(screen.getByText('title:r1'))
    await waitFor(() => expect(markRead).toHaveBeenCalledWith('r1'))
    expect(screen.getByText('body:r1')).toBeInTheDocument()
  })

  it('truly-empty renders the full empty state with the ruled copy', () => {
    useNotifications.mockReturnValue(
      baseHook({ receipts: [], unreadCount: 0, totalCount: 0 }),
    )
    render(<NotificationsPage />)
    expect(screen.getByText("You're all caught up")).toBeInTheDocument()
    expect(
      screen.getByText(
        /Notifications from your sites and workspace land here\. Cleanup is automatic — read items delete after their retention window\./,
      ),
    ).toBeInTheDocument()
  })

  it('filtered-empty is the deliberately poorer tier with Show all', () => {
    search = new URLSearchParams('category=team')
    useNotifications.mockReturnValue(baseHook({ receipts: [] }))
    render(<NotificationsPage />)
    expect(screen.getByText('Nothing in Team')).toBeInTheDocument()
    expect(screen.getByText(/clear the filter to see all 87/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show all' })).toBeInTheDocument()
    // The orange CTA is reserved for truly-empty.
    expect(screen.queryByText("You're all caught up")).toBeNull()
  })

  it('the footer pairs the cleanup fact with the purge at the TRUE global count', () => {
    render(<NotificationsPage />)
    expect(
      screen.getByText(
        /Cleanup is automatic — read notifications delete on their category's retention window\. Pulse keeps nothing longer\./,
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Purge all 87 notifications' })).toBeInTheDocument()
  })

  it('a null total renders no fabricated count on the purge control', () => {
    useNotifications.mockReturnValue(baseHook({ totalCount: null }))
    render(<NotificationsPage />)
    expect(screen.getByRole('button', { name: 'Purge all notifications' })).toBeInTheDocument()
    expect(screen.getByText(/5 unread · — total/)).toBeInTheDocument()
  })

  it('the error state renders as an error, never as empty', () => {
    useNotifications.mockReturnValue(
      baseHook({ receipts: [], error: new Error('notifications_unavailable') }),
    )
    render(<NotificationsPage />)
    expect(screen.getByRole('alert')).toHaveTextContent('Failed to load notifications.')
    expect(screen.queryByText("You're all caught up")).toBeNull()
  })
})
