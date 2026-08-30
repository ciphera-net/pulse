/**
 * @file The bell's first interactive tests.
 *
 * The fleet audit's finding was blunt — "zero interactive tests; the bell, page,
 * row, chips, bulk bar and destructive purge dialog have no test between them"
 * (`Pulse/docs/audits/29-08-2026-notification-system-fleet-audit.md` §4.2). These
 * pin the four defect fixes and the two ruled behaviours from
 * `Pulse/docs/plans/30-08-2026-bell-room-direction-a-spec.md` §1–§2, §4.
 *
 * 🔴 EVERY `it` CARRIES A `MUST FAIL ON:` LINE. It names the exact one-line
 * mutation a reviewer applies to the source to watch the test go red. A test
 * whose mutation cannot be named is a test that is measuring something adjacent.
 *
 * ── Two harness decisions, both measured rather than assumed ────────────────
 *
 * 1. **The SWR cache is isolated by KEY, not by an `SWRConfig` provider.**
 *    A fresh `provider={() => new Map()}` per test does isolate — but it also
 *    silently severs `invalidateNotifications()`, which is the module-level
 *    `mutate` from 'swr' and is bound to the DEFAULT cache. Measured: under a
 *    custom provider, "Mark all read" leaves `listNotifications` on 1 call — the
 *    post-mutation revalidation never happens, so P-F6's whole invalidation path
 *    would be untested and a regression that deleted the `invalidateNotifications()`
 *    call would still be green. Instead every test gets a UNIQUE `org_id`, which
 *    makes a unique SWR key: nothing from a previous test can be in the cache or
 *    in SWR's dedupe map under that key, and the real global invalidation still
 *    reaches the tree (measured: 1 fetch on mount, 2 after a mutation).
 *
 * 2. **framer-motion is NOT mocked.** The focus-restore contract depends on
 *    `AnimatePresence` keeping the panel node mounted through its exit: React
 *    detaches refs during the mutation phase, so a mock that renders children
 *    directly leaves `panelRef.current === null` by the time the `[open]` effect
 *    runs and the restore silently never fires. Mocking it here would produce a
 *    red that says nothing about the component.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react'
import type { Receipt } from '@/lib/notifications/types'

// --- The fake server -------------------------------------------------------
// Mocked at the API layer, per house convention — never at `fetch`. But WITH
// STATE: a stateless mock hands the pre-mutation list back on every
// revalidation, quietly undoing the very thing under test.

const listNotifications = vi.fn()
const markReadApi = vi.fn()
const markAllReadApi = vi.fn()
const dismissApi = vi.fn()

vi.mock('@/lib/api/notifications-v2', () => ({
  listNotifications: (p: unknown) => listNotifications(p),
  markRead: (id: string) => markReadApi(id),
  markAllRead: () => markAllReadApi(),
  dismiss: (id: string) => dismissApi(id),
}))

let orgId = 'org-0'
vi.mock('@/lib/auth/context', () => ({ useAuth: () => ({ user: { org_id: orgId } }) }))

// The renderers resolve site/user UUIDs through these; the fixtures below are
// `system_announcement`, which carries its own words and consults neither.
vi.mock('@/lib/swr/sites', () => ({ useSites: () => ({ sites: [] }) }))
vi.mock('@/lib/swr/members', () => ({ useMembers: () => ({ members: [] }) }))

const routerPush = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: routerPush }) }))
vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: any) => <a href={href} {...rest}>{children}</a>,
}))

const toastError = vi.fn()
/**
 * `authMessage` is what `getAuthErrorMessage` resolves to. '' stands for the
 * ordinary case — an error the auth helper does not recognise — which is what
 * makes the component's OWN fallback copy the thing under test. One test flips
 * it to prove the other half of the `||` still wins.
 */
let authMessage = ''
vi.mock('@ciphera-net/facet', () => ({
  toast: { error: (m: string) => toastError(m) },
  getAuthErrorMessage: () => authMessage,
  SettingsIcon: (p: any) => <svg {...p} />,
  cn: (...a: any[]) => a.flat(Infinity).filter(Boolean).join(' '),
}))

import NotificationCenter from '../NotificationCenter'

// --- Fixtures --------------------------------------------------------------

const READ_AT = '2026-08-30T09:00:00Z'

function receipt(id: string, title: string, read: boolean): Receipt {
  return {
    user_id: 'u1',
    event_id: id,
    delivered_at: null,
    read_at: read ? READ_AT : null,
    event: {
      id,
      organization_id: 'o1',
      type: 'system_announcement',
      payload: { title, body: `${title} body` } as any,
      // null on purpose: the row then renders its <button> branch, so a click is
      // a click and not a jsdom navigation. The <Link> branch is exercised in
      // NotificationRows.test.tsx.
      link_url: null,
      link_label_key: null,
      created_at: '2026-08-30T08:00:00Z',
      expires_at: '2026-09-30T08:00:00Z',
    },
  }
}

let server: Receipt[] = []
let testNo = 0

beforeEach(() => {
  orgId = `org-${++testNo}` // see harness decision 1 — this IS the cache isolation
  authMessage = ''
  toastError.mockReset()
  routerPush.mockReset()
  server = [receipt('a', 'Alpha alert', false), receipt('b', 'Beta alert', true)]

  listNotifications.mockReset().mockImplementation(async () => ({
    receipts: server.map((r) => ({ ...r })),
    unread_count: server.filter((r) => !r.read_at).length,
    total_count: server.length,
  }))
  markReadApi.mockReset().mockImplementation(async (id: string) => {
    const r = server.find((x) => x.event_id === id)
    if (r) r.read_at = '2026-08-30T10:00:00Z'
  })
  markAllReadApi.mockReset().mockImplementation(async () => {
    server = server.map((r) => ({ ...r, read_at: r.read_at ?? '2026-08-30T10:00:00Z' }))
  })
  dismissApi.mockReset().mockImplementation(async (id: string) => {
    server = server.filter((x) => x.event_id !== id)
  })
})

// --- Helpers ---------------------------------------------------------------

const BELL = /^Notifications(,|$)/

const classesOf = (el: Element) => (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)

/** Every element of a subtree, the root included. */
const tree = (root: Element) => [root, ...Array.from(root.querySelectorAll('*'))]

const rowFor = (title: string) => screen.getByText(title).closest('li') as HTMLElement

async function bells() {
  return screen.findAllByRole('button', { name: BELL })
}

/** Render, wait for the ONE inbox fetch to land, open the panel. */
async function openPanel(index = 0) {
  await waitFor(() => expect(listNotifications).toHaveBeenCalled())
  const all = await bells()
  fireEvent.click(all[index])
  return await screen.findByRole('dialog')
}

// ---------------------------------------------------------------------------

describe('NotificationCenter — unread is a dot, not a tint', () => {
  /**
   * The whole point of the round. `bg-brand-orange/10` washed the entire unread
   * row, which breaks the house device every sibling follows: colour lives in a
   * small dot or a single word, never in a panel background.
   *
   * MUST FAIL ON: NotificationRows.tsx — give the row's <button>/<Link> the old
   * treatment back, e.g. `${isUnread ? 'bg-brand-orange/10' : ''}` on its className.
   */
  it('TestUnreadIsADotNotATint: no row carries a brand tint, and the unread row carries a dot', async () => {
    render(<NotificationCenter />)
    await openPanel()
    await screen.findByText('Alpha alert')

    // The tint is `bg-brand-orange` WITH an opacity modifier. Self-check the
    // matcher first: a regex that matches nothing would make the sweep below
    // pass vacuously, which is exactly the "check measures something adjacent"
    // failure this file exists to avoid.
    const TINT = /(?:^|:)bg-brand-orange\/\S+$/
    expect(TINT.test('bg-brand-orange/10')).toBe(true)
    expect(TINT.test('bg-brand-orange/[0.06]')).toBe(true)
    expect(TINT.test('hover:bg-brand-orange/10')).toBe(true)
    expect(TINT.test('bg-brand-orange')).toBe(false) // the DOT must survive the sweep

    const unread = rowFor('Alpha alert')
    const read = rowFor('Beta alert')
    expect(unread).not.toBe(read) // both rows really rendered

    const tinted = [...tree(unread), ...tree(read)]
      .filter((el) => classesOf(el).some((c) => TINT.test(c)))
      .map((el) => el.getAttribute('class'))
    expect(tinted).toEqual([])

    // ...and the signal that replaced it is really there. Without this half the
    // assertion above would also pass against a component rendering nothing.
    const dots = (row: Element) =>
      tree(row).filter((el) => {
        const c = classesOf(el)
        return c.includes('bg-brand-orange') && c.includes('rounded-full')
      })
    expect(dots(unread)).toHaveLength(1)
    expect(dots(read)).toHaveLength(0)

    // The weight change is the dot's other half (spec §1.3).
    expect(classesOf(screen.getByText('Alpha alert'))).toEqual(
      expect.arrayContaining(['font-medium', 'text-white']),
    )
    expect(classesOf(screen.getByText('Beta alert'))).toEqual(
      expect.arrayContaining(['text-neutral-300']),
    )
    expect(classesOf(screen.getByText('Beta alert'))).not.toContain('font-medium')
  })
})

describe('NotificationCenter — the two strata', () => {
  const HEADER = /^(New|Earlier)$/

  /**
   * MUST FAIL ON: NotificationCenter.tsx — reverse the strata array, i.e.
   * `[{ label: 'Earlier', … }, { label: 'New', … }]`.
   */
  it('renders exactly two headers, New above Earlier, when both strata have rows', async () => {
    render(<NotificationCenter />)
    await openPanel()
    await screen.findByText('Alpha alert')

    const list = screen.getByRole('list')
    const headers = within(list).getAllByText(HEADER)
    expect(headers.map((h) => h.textContent)).toEqual(['New', 'Earlier'])

    // Order is a claim about POSITION, not just about presence: the unread row
    // sits under New, the read row under Earlier.
    const kids = Array.from(list.children)
    expect(kids.indexOf(rowFor('Alpha alert'))).toBe(kids.indexOf(headers[0]) + 1)
    expect(kids.indexOf(rowFor('Beta alert'))).toBe(kids.indexOf(headers[1]) + 1)
  })

  /**
   * n−1 leg. A header on a homogeneous list labels nothing (spec §2).
   *
   * MUST FAIL ON: NotificationCenter.tsx — `const showHeaders = strata.length > 0`
   * (or simply `true`).
   */
  it('renders ZERO headers when every receipt is read', async () => {
    server = [receipt('a', 'Alpha alert', true), receipt('b', 'Beta alert', true)]
    render(<NotificationCenter />)
    await openPanel()
    await screen.findByText('Alpha alert')

    const list = screen.getByRole('list')
    expect(within(list).queryAllByText(HEADER)).toEqual([])
    // The nearest case that must still pass: the rows themselves are there. A
    // component rendering an empty list would satisfy the line above too.
    expect(within(list).getByText('Alpha alert')).toBeInTheDocument()
    expect(within(list).getByText('Beta alert')).toBeInTheDocument()
  })

  /**
   * The `[open]`-only effect dependency, stated as behaviour: marking a row read
   * changes its dot and its weight IN PLACE — it does not jump strata out from
   * under a cursor mid-scan. The next open re-stratifies.
   *
   * MUST FAIL ON: NotificationCenter.tsx — read the LIVE flag instead of the
   * open-time snapshot in the strata filters, i.e. swap both
   * `snapshotRead.current.has(r.event_id)` for `!!r.read_at`. (Adding `receipts`
   * to the two snapshot effects' deps is the same regression, but `receipts` is
   * a fresh array on every render, so that variant spins rather than going red —
   * use the filter swap.)
   */
  it('holds the strata still while the panel is open, and still re-weights the row', async () => {
    render(<NotificationCenter />)
    await openPanel()
    await screen.findByText('Alpha alert')

    const list = screen.getByRole('list')
    const alpha = rowFor('Alpha alert')
    const before = Array.from(list.children).map((el) =>
      el === alpha ? 'ALPHA' : el.textContent?.slice(0, 20),
    )
    expect(before[0]).toBe('New')
    expect(before[1]).toBe('ALPHA')

    fireEvent.click(screen.getByRole('button', { name: 'Mark all notifications as read' }))

    // The mutation really landed — without this the "did not move" assertion
    // below would pass against a button that does nothing at all.
    await waitFor(() =>
      expect(screen.getByText('Alpha alert').className).toContain('text-neutral-300'),
    )
    expect(screen.getByText('Alpha alert').className).not.toContain('font-medium')
    await waitFor(() => expect(markAllReadApi).toHaveBeenCalledTimes(1))

    // ...and the row is still the same node, in the same slot, under New.
    const after = Array.from(list.children).map((el) =>
      el === alpha ? 'ALPHA' : el.textContent?.slice(0, 20),
    )
    expect(after).toEqual(before)
    expect(within(list).getAllByText(HEADER).map((h) => h.textContent)).toEqual(['New', 'Earlier'])
  })
})

describe('NotificationCenter — every mutation surfaces its failure', () => {
  /**
   * MUST FAIL ON: NotificationCenter.tsx — empty the catch in `handleMarkRead`
   * (`catch { /* ignore *\/ }`), which is the shape this replaced.
   */
  it('toasts when mark-read fails', async () => {
    markReadApi.mockRejectedValue(new Error('500'))
    render(<NotificationCenter />)
    await openPanel()
    fireEvent.click(await screen.findByText('Alpha alert'))

    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1))
    expect(toastError).toHaveBeenCalledWith('Failed to mark notification as read')
    expect(toastError.mock.calls[0][0]).not.toBe('')
  })

  /**
   * The other half of `getAuthErrorMessage(err) || FALLBACK`: when the helper
   * DOES recognise the error, its message wins.
   *
   * MUST FAIL ON: NotificationCenter.tsx — hard-code the fallback,
   * `toast.error('Failed to mark notification as read')`.
   */
  it('prefers a resolved auth message over the fallback copy', async () => {
    authMessage = 'Your session expired'
    markReadApi.mockRejectedValue(new Error('401'))
    render(<NotificationCenter />)
    await openPanel()
    fireEvent.click(await screen.findByText('Alpha alert'))

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Your session expired'))
  })

  /**
   * MUST FAIL ON: NotificationCenter.tsx — delete the `catch` from
   * `handleDismiss`, leaving the `try/finally` the /notifications page had.
   */
  it('toasts when dismiss fails, and the row comes back', async () => {
    dismissApi.mockRejectedValue(new Error('500'))
    render(<NotificationCenter />)
    await openPanel()
    await screen.findByText('Alpha alert')

    fireEvent.click(screen.getByRole('button', { name: 'Delete my copy of "Alpha alert"' }))

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Failed to dismiss notification'))
    // rollbackOnError is what makes the toast describe something visible: the
    // optimistically-removed row is back, and it is no longer "Removing…".
    await waitFor(() => expect(screen.getByText('Alpha alert')).toBeInTheDocument())
    expect(screen.queryByText('Removing…')).toBeNull()
  })

  /**
   * MUST FAIL ON: NotificationCenter.tsx — empty the catch in `handleMarkAllRead`.
   */
  it('toasts when mark-all-read fails, and the unread count survives', async () => {
    markAllReadApi.mockRejectedValue(new Error('500'))
    render(<NotificationCenter />)
    await openPanel()
    await screen.findByText('Alpha alert')

    fireEvent.click(screen.getByRole('button', { name: 'Mark all notifications as read' }))

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Failed to mark all as read'))
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: 'Notifications, 1 unread' })).toHaveLength(1),
    )
  })

  /**
   * n−1 leg for all three above: on success nothing shouts. Without this, a
   * component that called `toast.error` unconditionally would pass every test
   * in this describe block.
   *
   * MUST FAIL ON: NotificationCenter.tsx — move the `toast.error(…)` line in
   * `handleMarkRead` out of its catch and into the try, after `await markRead(…)`.
   */
  it('says nothing at all when all three mutations succeed', async () => {
    // Two unread, so mark-read and mark-all-read each have a target to act on.
    server = [
      receipt('a', 'Alpha alert', false),
      receipt('b', 'Beta alert', false),
      receipt('c', 'Gamma alert', true),
    ]
    render(<NotificationCenter />)

    await openPanel()
    fireEvent.click(await screen.findByText('Alpha alert')) // mark read — closes the panel
    await waitFor(() => expect(markReadApi).toHaveBeenCalledTimes(1))

    await openPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Mark all notifications as read' }))
    await waitFor(() => expect(markAllReadApi).toHaveBeenCalledTimes(1))

    fireEvent.click(await screen.findByRole('button', { name: 'Delete my copy of "Gamma alert"' }))
    await waitFor(() => expect(dismissApi).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.queryByText('Gamma alert')).toBeNull())

    expect(toastError).not.toHaveBeenCalled()
  })
})

describe('NotificationCenter — reads stay soft', () => {
  /**
   * A failed 90 s poll must not shout. It shows the in-panel error body and
   * keeps its mouth shut; the toast register belongs to mutations (spec §4.1).
   *
   * MUST FAIL ON: useNotificationInbox.ts — import
   * `{ toast, getAuthErrorMessage } from '@ciphera-net/facet'` and add
   * `onError: (e) => { toast.error(getAuthErrorMessage(e as Error) || 'Failed to load notifications') }`
   * to the useSWR options. (The import matters: without it the mutation throws a
   * ReferenceError and the red would be about the harness, not the behaviour.)
   */
  it('shows the error body and does NOT toast when the list fetch fails', async () => {
    listNotifications.mockRejectedValue(new Error('network'))
    render(<NotificationCenter />)
    await openPanel()

    const body = await screen.findByText('Failed to load notifications')
    // The nearest case that must still pass: something IS on screen, and it is
    // the error body — not the blank panel or, worse, "All quiet", which would
    // read a broken poll as "you have nothing".
    expect(body).toBeInTheDocument()
    expect(classesOf(body)).toContain('text-red-500')
    expect(screen.queryByText('All quiet')).toBeNull()

    expect(toastError).not.toHaveBeenCalled()
  })
})

describe('NotificationCenter — the destructive control is reachable AND visible', () => {
  /**
   * `opacity-0 group-hover:opacity-100` alone left this focusable-but-INVISIBLE:
   * a keyboard user could Tab onto a destructive action with nothing on screen
   * to say so. jsdom carries no Tailwind, so the class list is the observable
   * proxy for the rule — but the FOCUSABILITY half below is real, and it is what
   * makes the missing rule a defect rather than a nit.
   *
   * MUST FAIL ON: NotificationRows.tsx — drop `focus:opacity-100` from the
   * dismiss button's className.
   */
  it('keeps the dismiss control opacity-0 by default, and reveals it on focus', async () => {
    render(<NotificationCenter />)
    await openPanel()
    await screen.findByText('Alpha alert')

    const x = screen.getByRole('button', { name: 'Delete my copy of "Alpha alert"' })
    const c = classesOf(x)

    // It really is reachable by keyboard — the premise of the defect.
    x.focus()
    expect(document.activeElement).toBe(x)

    expect(c).toContain('opacity-0')          // still hidden at rest…
    expect(c).toContain('group-hover:opacity-100')
    expect(c).toContain('focus:opacity-100')  // …but never while it holds focus
    expect(c).toContain('[@media(pointer:coarse)]:opacity-100') // nor on touch, where hover never comes
  })
})

describe('NotificationCenter — the panel is a real dialog', () => {
  /**
   * `role="dialog"` had been on this node for months with no `aria-modal`, no
   * focus move on open and no restore on close.
   *
   * MUST FAIL ON: NotificationCenter.tsx — delete `panelRef.current?.focus()`
   * from the open branch of the focus effect. (For the Escape half: delete the
   * `buttonRef.current?.focus()` restore.)
   */
  it('moves focus in on open and returns it to the bell on Escape', async () => {
    render(<NotificationCenter />)
    const trigger = (await bells())[0]
    expect(document.activeElement).not.toBe(trigger)

    const panel = await openPanel()
    expect(panel).toHaveAttribute('aria-modal', 'true')
    expect(panel).toHaveAttribute('aria-label', 'Notifications')
    await waitFor(() => expect(document.activeElement).toBe(panel))

    fireEvent.keyDown(document, { key: 'Escape' })

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(trigger))
  })
})

describe('NotificationCenter — one store, two mounts (P-F3 / P-F6)', () => {
  /**
   * The bell mounts twice on every authenticated page (GlassTopBar `hidden
   * md:flex`, ContentHeader `md:hidden`); only CSS hides one. Each used to carry
   * its own state and its own 90 s poll — two counts that disagreed the moment
   * the viewport crossed `md`, and twice the polling.
   *
   * MUST FAIL ON: useNotificationInbox.ts — give each mount its own key:
   * `import { useCallback, useRef } from 'react'`, then
   * `const instance = useRef(Math.random())` and
   * `[NOTIFICATIONS_KEY, orgId ?? '', 'inbox', instance.current]`. That is what
   * two independent stores looks like, and the fetch count goes 1 → 2.
   * (Two variants that do NOT work as mutations, both measured: an inline
   * `Math.random()` in the key changes on every render and spins instead of going
   * red; and `dedupingInterval: 0` does not budge the count at all, because SWR
   * dedupes concurrent in-flight requests for a shared key regardless — so this
   * test is pinning ONE STORE, not the dedupe window.)
   */
  it('fetches the inbox ONCE for two mounts, and a mark-read in one updates the other', async () => {
    render(
      <>
        <NotificationCenter />
        <NotificationCenter />
      </>,
    )

    // Both really mounted — otherwise "fetched once" is just "one bell exists".
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: 'Notifications, 1 unread' })).toHaveLength(2),
    )
    expect(listNotifications).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getAllByRole('button', { name: BELL })[0])
    await screen.findByRole('dialog')
    fireEvent.click(screen.getByRole('button', { name: 'Mark all notifications as read' }))

    // The count the OTHER mount renders changes too — one store, one truth.
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: 'Notifications' })).toHaveLength(2),
    )
    expect(screen.queryAllByRole('button', { name: 'Notifications, 1 unread' })).toEqual([])
    // One store also means one write, not one per mount.
    expect(markAllReadApi).toHaveBeenCalledTimes(1)
  })
})
