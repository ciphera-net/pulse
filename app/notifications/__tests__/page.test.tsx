/**
 * @file /notifications — "the bell, longer" (direction a, owner pick 22-09-2026,
 * PULSE-15). Replaces DayRegister.test.tsx, whose subject (tabs, controls row,
 * expand-on-click rows, the purge footer) no longer exists.
 *
 * 🔴 EVERY `it` CARRIES A `MUST FAIL ON:` LINE.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import type { Receipt } from '@/lib/notifications/types'

// --- Mocks ---------------------------------------------------------------

// The anchor keeps its href (asserted below) but never navigates: jsdom has no
// navigation, and a pending one bleeds "_location of null" into whichever
// suite tears down next.
vi.mock('next/link', () => ({
  default: ({ children, href, onClick, ...rest }: any) => (
    <a href={href} onClick={(e: any) => { e.preventDefault(); onClick?.(e) }} {...rest}>{children}</a>
  ),
}))

const useNotifications = vi.fn()
// The empty state names the container from the ONE team-state signal (PULSE-59).
let mockTeamState: 'alone' | 'team' | null = 'team'
vi.mock('@/lib/hooks/useTeamState', () => ({ useTeamState: () => mockTeamState }))

vi.mock('@/lib/hooks/useNotifications', () => ({
  useNotifications: (p: unknown) => useNotifications(p),
}))

const invalidate = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/hooks/useNotificationInbox', () => ({
  NOTIFICATIONS_KEY: 'notifications',
  useInvalidateNotifications: () => invalidate,
}))

const markRead = vi.fn().mockResolvedValue({})
const dismiss = vi.fn().mockResolvedValue({})
vi.mock('@/lib/api/notifications-v2', () => ({
  markRead: (id: string) => markRead(id),
  dismiss: (id: string) => dismiss(id),
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
  getTypeIcon: () => <svg data-testid="type-icon" />,
  formatTimeAgo: () => 'ago',
}))

const toastError = vi.fn()
vi.mock('@ciphera-net/facet', () => ({
  cn: (...a: any[]) => a.flat(Infinity).filter(Boolean).join(' '),
  Button: ({ children, variant, size, isLoading, asChild, ...rest }: any) => (
    <button data-variant={variant} data-size={size} {...rest}>{children}</button>
  ),
  XIcon: (p: any) => <svg data-icon="x" {...p} />,
  toast: { error: (m: string) => toastError(m), success: vi.fn() },
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
  uptime: { display_name: 'Monitoring', unread: 2, total: 41 },
  site: { display_name: 'Site activity', unread: 1, total: 17 },
  team: { display_name: 'Team', unread: 0, total: 5 },
  system: { display_name: 'System', unread: 0, total: 3 },
}

// Calendar arithmetic (noon of the day), not a fixed-hour offset from "now" —
// matches sections.tsx's own grouping. A `now - 26h` fixture lands two calendar
// days back whenever it is evaluated between 00:00 and 02:00 local.
function dayFixtureTimes(base: Date) {
  const y = base.getFullYear()
  const m = base.getMonth()
  const d = base.getDate()
  return {
    todayISO: new Date(y, m, d, 12).toISOString(),
    yesterdayISO: new Date(y, m, d - 1, 12, 5).toISOString(),
  }
}
const { todayISO, yesterdayISO } = dayFixtureTimes(new Date())

function baseHook(over: Record<string, unknown> = {}) {
  return {
    receipts: [
      receipt('r1', 'uptime_monitor_down', todayISO, { category_id: 'uptime' }),
      receipt('r2', 'billing_invoice_sent', yesterdayISO, {
        category_id: 'billing',
        read_at: yesterdayISO,
        delivered_at: yesterdayISO,
        email_status: 'delivered',
        event: { ...receipt('r2', 'billing_invoice_sent', yesterdayISO).event, link_url: '/settings/organization/billing' },
      }),
    ],
    unreadCount: 1,
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
  invalidate.mockResolvedValue(undefined)
  markRead.mockResolvedValue({})
  dismiss.mockResolvedValue({})
  useNotifications.mockReturnValue(baseHook())
})

afterEach(() => {
  vi.useRealTimers()
})

const classesOf = (el: Element) => (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)

// --- Tests ---------------------------------------------------------------

describe('/notifications — one list (direction a)', () => {
  /**
   * MUST FAIL ON: page.tsx — render `{section.items.length} notifications`
   * beside the day heading again.
   */
  it('groups rows by day with day headers and no counts', () => {
    render(<NotificationsPage />)
    expect(screen.getByRole('heading', { name: 'Today' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Yesterday' })).toBeInTheDocument()
    expect(screen.queryByText(/\d+ notifications?$/)).toBeNull()
  })

  /**
   * MUST FAIL ON: sections.tsx — replace the calendar-day key with a fixed
   * `now - 24h` comparison.
   */
  it('still labels "Yesterday" when the clock reads 01:30 local (not a fixed 24h/26h offset)', () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const pinned = new Date()
    vi.setSystemTime(new Date(pinned.getFullYear(), pinned.getMonth(), pinned.getDate(), 1, 30))
    const { todayISO: t, yesterdayISO: y } = dayFixtureTimes(new Date())
    useNotifications.mockReturnValue(
      baseHook({
        receipts: [
          receipt('r1', 'uptime_monitor_down', t, { category_id: 'uptime' }),
          receipt('r2', 'billing_invoice_sent', y, { category_id: 'billing' }),
        ],
      }),
    )
    render(<NotificationsPage />)
    expect(screen.getByRole('heading', { name: 'Today' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Yesterday' })).toBeInTheDocument()
  })

  /**
   * The rows are the bell's rows: icon chip, title, clock time, body, the
   * category word — and nothing about the email leg.
   *
   * MUST FAIL ON: page.tsx — render `RegisterRow`-style meta again, e.g. append
   * `· Delivered {hhmm(r.delivered_at)}` to the `meta` prop.
   */
  it('renders the bell\'s row anatomy with a clock time and the category word, no email leg', () => {
    const { container } = render(<NotificationsPage />)
    const r2 = screen.getByText('title:r2').closest('li') as HTMLElement
    expect(r2.querySelector('span.w-8.h-8 svg[data-testid="type-icon"]')).toBeTruthy()
    expect(within(r2).getByText('Billing')).toBeInTheDocument()
    expect(within(r2).getByText(/^\d\d:\d\d$/)).toBeInTheDocument()
    expect(within(r2).queryByText(/Delivered|Emailed|bounced|suppressed/)).toBeNull()
    expect(within(r2).getByText('body:r2')).toBeInTheDocument()
    // The registry name from the wire, never the local fallback, when the wire has it.
    const r1 = screen.getByText('title:r1').closest('li') as HTMLElement
    expect(within(r1).getByText('Monitoring')).toBeInTheDocument()
    expect(container.querySelectorAll('li').length).toBe(2)
  })

  /**
   * MUST FAIL ON: page.tsx — in `onActivate`, drop the `if (r.read_at) return`
   * guard (marks a read row again), or call `markRead` twice.
   */
  it('a linked row is a link, and activating an unread row marks it read once', async () => {
    render(<NotificationsPage />)
    const link = screen.getByText('title:r2').closest('a') as HTMLAnchorElement
    expect(link).toHaveAttribute('href', '/settings/organization/billing')

    fireEvent.click(link) // read already — nothing to mark
    expect(markRead).not.toHaveBeenCalled()

    fireEvent.click(screen.getByText('title:r1')) // unread — marks
    await waitFor(() => expect(markRead).toHaveBeenCalledTimes(1))
    expect(markRead).toHaveBeenCalledWith('r1')
    await waitFor(() => expect(invalidate).toHaveBeenCalled())
    expect(toastError).not.toHaveBeenCalled()
  })

  /**
   * MUST FAIL ON: page.tsx — call `dismiss` without adding the id to
   * `removing` first (the row never says Removing…), or empty the catch.
   */
  it('the × dismisses: the row recedes while pending, the API is called, and a failure toasts', async () => {
    let resolve!: () => void
    dismiss.mockReturnValueOnce(new Promise<void>((r) => { resolve = r }))
    render(<NotificationsPage />)

    fireEvent.click(screen.getByRole('button', { name: /^Dismiss "title:r1", \d\d:\d\d$/ }))
    expect(dismiss).toHaveBeenCalledWith('r1')
    expect(await screen.findByText('Removing…')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Dismiss "title:r1", \d\d:\d\d$/ })).toBeNull()
    resolve()
    await waitFor(() => expect(screen.queryByText('Removing…')).toBeNull())
    expect(invalidate).toHaveBeenCalled()
    expect(toastError).not.toHaveBeenCalled()

    dismiss.mockRejectedValueOnce(new Error('500'))
    fireEvent.click(screen.getByRole('button', { name: /^Dismiss "title:r2", \d\d:\d\d$/ }))
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('500'))
    await waitFor(() => expect(screen.queryByText('Removing…')).toBeNull())
    expect(screen.getByRole('button', { name: /^Dismiss "title:r2", \d\d:\d\d$/ })).toBeInTheDocument()
  })

  /**
   * Everything the register carried that the owner retired, pinned absent.
   *
   * MUST FAIL ON: page.tsx — render a button named "Unread only", "Mark all
   * read" or "Purge all …", a `radiogroup`, or the "N unread · M total" summary.
   */
  it('carries none of the register: no tabs, no unread controls, no purge, no footer', () => {
    render(<NotificationsPage />)
    expect(screen.queryByRole('radiogroup')).toBeNull()
    expect(screen.queryByRole('button', { name: /unread only/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /mark .*read/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /^purge/i })).toBeNull()
    expect(screen.queryByText(/unread · /)).toBeNull()
    expect(screen.queryByText(/Cleanup is automatic/)).toBeNull() // only the empty state says it
    expect(screen.getByText('Everything Pulse has told you.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Notification settings' })).toHaveAttribute('href', '/settings/account/notifications')
  })

  /**
   * MUST FAIL ON: page.tsx — change the `EmptyState` title.
   */
  it('empty renders the full empty state with the ruled copy', () => {
    useNotifications.mockReturnValue(baseHook({ receipts: [], unreadCount: 0, totalCount: 0 }))
    mockTeamState = 'team'
    const { unmount } = render(<NotificationsPage />)
    expect(screen.getByText("You're all caught up")).toBeInTheDocument()
    expect(
      screen.getByText(
        /Notifications from your sites and team land here\. Cleanup is automatic — read items delete after their retention window\./,
      ),
    ).toBeInTheDocument()
    unmount()
    // Somebody alone has no team to name (PULSE-59).
    mockTeamState = 'alone'
    render(<NotificationsPage />)
    expect(screen.getByText(/Notifications from your sites and account land here\./)).toBeInTheDocument()
    mockTeamState = 'team'
  })

  /**
   * MUST FAIL ON: page.tsx — render the empty state when `error` is set.
   */
  it('the error state renders as an error, never as empty', () => {
    useNotifications.mockReturnValue(baseHook({ receipts: [], error: new Error('notifications_unavailable') }))
    render(<NotificationsPage />)
    expect(screen.getByRole('alert')).toHaveTextContent('Failed to load notifications.')
    expect(screen.queryByText("You're all caught up")).toBeNull()
  })

  /**
   * The page fetches one unfiltered page; the filters left with the tabs.
   *
   * MUST FAIL ON: page.tsx — pass `unread: true` or a `category` to the hook.
   */
  it('asks the hook for one unfiltered page', () => {
    render(<NotificationsPage />)
    expect(useNotifications).toHaveBeenCalledWith({ limit: 100 })
  })

  /**
   * MUST FAIL ON: NotificationRows.tsx — add `font-mono` to the time or the meta line.
   */
  it('puts no mono on chrome — times and category words are sans', () => {
    const { container } = render(<NotificationsPage />)
    const mono = Array.from(container.querySelectorAll('*')).filter((el) => classesOf(el).includes('font-mono'))
    expect(mono).toEqual([])
  })
})
