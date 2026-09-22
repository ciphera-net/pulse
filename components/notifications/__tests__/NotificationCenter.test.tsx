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
  XIcon: (p: any) => <svg data-icon="x" {...p} />,
  Button: ({ children, variant, size, isLoading, asChild, ...rest }: any) => (
    <button data-variant={variant} data-size={size} {...rest}>{children}</button>
  ),
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
   * The `[open]`-only effect dependency, stated as behaviour. Opening READS
   * (R-B, 22-09-2026): the read-all lands in the same frame the panel appears,
   * so if the strata or the rows followed the LIVE flag, the New header and the
   * dot would vanish the instant they were shown. Both come from the open-time
   * snapshot instead and hold for as long as the panel is open; the next open
   * re-stratifies, and by then there is nothing new.
   *
   * MUST FAIL ON: NotificationCenter.tsx — pass the live flag to the row,
   * `unread={!r.read_at}` in place of `unread={!snapshotRead.current.has(r.event_id)}`.
   * (For the strata half: swap both `snapshotRead.current.has(r.event_id)` in
   * the filters for `!!r.read_at`.)
   */
  it('holds the strata AND the rows\' open-time state still while the panel is open', async () => {
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

    // The read really landed — the server has it, and the badge is gone.
    await waitFor(() => expect(markAllReadApi).toHaveBeenCalledTimes(1))
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: 'Notifications' })).toHaveLength(1),
    )

    // ...and the row still reads as new: same node, same slot, same weight, its dot.
    const after = Array.from(list.children).map((el) =>
      el === alpha ? 'ALPHA' : el.textContent?.slice(0, 20),
    )
    expect(after).toEqual(before)
    expect(within(list).getAllByText(HEADER).map((h) => h.textContent)).toEqual(['New', 'Earlier'])
    expect(classesOf(screen.getByText('Alpha alert'))).toEqual(
      expect.arrayContaining(['font-medium', 'text-white']),
    )
    expect(tree(alpha).some((el) => classesOf(el).includes('bg-brand-orange'))).toBe(true)

    // The next open re-stratifies: everything is Earlier now, and nothing new
    // means nothing to read — the effect does not fire a second time.
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await openPanel()
    await screen.findByText('Alpha alert')
    expect(within(screen.getByRole('list')).queryAllByText(HEADER)).toEqual([])
    expect(classesOf(screen.getByText('Alpha alert'))).toContain('text-neutral-300')
    expect(markAllReadApi).toHaveBeenCalledTimes(1)
  })
})

describe('NotificationCenter — every mutation surfaces its failure', () => {
  /**
   * MUST FAIL ON: NotificationCenter.tsx — empty the catch in `handleMarkRead`
   * (`catch { /* ignore *\/ }`), which is the shape this replaced.
   */
  it('toasts when mark-read fails', async () => {
    // Opening reads everything first; only when THAT fails (and rolls back) is
    // a row still unread for a click to mark — so the per-row path is the
    // fallback behind read-on-open, and this is how it is reached.
    markAllReadApi.mockRejectedValue(new Error('500'))
    markReadApi.mockRejectedValue(new Error('500'))
    render(<NotificationCenter />)
    await openPanel()
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Failed to mark all as read'))
    fireEvent.click(await screen.findByText('Alpha alert'))

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Failed to mark notification as read'))
    expect(toastError).toHaveBeenCalledTimes(2)
    expect(toastError.mock.calls[1][0]).not.toBe('')
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
    markAllReadApi.mockRejectedValue(new Error('401'))
    render(<NotificationCenter />)
    await openPanel()

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Your session expired'))
    expect(toastError).not.toHaveBeenCalledWith('Failed to mark all as read')
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

    fireEvent.click(screen.getByRole('button', { name: /^Dismiss "Alpha alert", / }))

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Failed to dismiss notification'))
    // rollbackOnError is what makes the toast describe something visible: the
    // optimistically-removed row is back, and it is no longer "Removing…".
    await waitFor(() => expect(screen.getByText('Alpha alert')).toBeInTheDocument())
    expect(screen.queryByText('Removing…')).toBeNull()
  })

  /**
   * MUST FAIL ON: NotificationCenter.tsx — empty the catch in `handleMarkAllRead`.
   */
  it('toasts when the read-on-open fails, and the unread count survives', async () => {
    markAllReadApi.mockRejectedValue(new Error('500'))
    render(<NotificationCenter />)
    await openPanel()
    await screen.findByText('Alpha alert')

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
  it('says nothing at all when the mutations succeed', async () => {
    server = [
      receipt('a', 'Alpha alert', false),
      receipt('b', 'Beta alert', false),
      receipt('c', 'Gamma alert', true),
    ]
    render(<NotificationCenter />)

    await openPanel() // reads on open
    await waitFor(() => expect(markAllReadApi).toHaveBeenCalledTimes(1))
    await screen.findByText('Gamma alert')

    fireEvent.click(await screen.findByRole('button', { name: /^Dismiss "Gamma alert", / }))
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

describe('NotificationCenter — the dismiss control is a visible button (22-09-2026)', () => {
  /**
   * The hover-only glyph (22 × 24 px on production, `opacity-0` at rest) was
   * rebuilt as the house rung for a row-level action: Facet ghost `Button` with
   * `XIcon`, visible at rest, labelled "Dismiss" (owner pick x1). jsdom carries
   * no Tailwind, so the class list is the proxy — the focusability is real.
   *
   * MUST FAIL ON: NotificationRows.tsx — add `opacity-0 group-hover:opacity-100`
   * back to the button's className.
   */
  it('renders every row\'s dismiss as a visible icon button that takes focus', async () => {
    render(<NotificationCenter />)
    await openPanel()
    await screen.findByText('Alpha alert')

    const x = screen.getByRole('button', { name: /^Dismiss "Alpha alert", / })
    expect(x.querySelector('svg[data-icon="x"]')).toBeTruthy()
    expect(classesOf(x).some((k) => /opacity-0/.test(k))).toBe(false)
    expect(x).toHaveAttribute('title', 'Dismiss')
    x.focus()
    expect(document.activeElement).toBe(x)
    // One per row, none shared.
    expect(screen.getByRole('button', { name: /^Dismiss "Beta alert", / })).toBeInTheDocument()
  })
})

describe('NotificationCenter — opening reads (R-B, 22-09-2026)', () => {
  /**
   * The badge clears because the panel opened, not because anything was
   * clicked, and the write goes out exactly once per open.
   *
   * MUST FAIL ON: NotificationCenter.tsx — delete the `[open]`-keyed effect
   * that calls `handleMarkAllRead()`.
   */
  it('fires one read-all on open and clears the badge', async () => {
    render(<NotificationCenter />)
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: 'Notifications, 1 unread' })).toHaveLength(1),
    )
    await openPanel()
    await waitFor(() => expect(markAllReadApi).toHaveBeenCalledTimes(1))
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: 'Notifications' })).toHaveLength(1),
    )
    // Re-rendering while open (a poll, a row hover) does not write again.
    await screen.findByText('Alpha alert')
    expect(markAllReadApi).toHaveBeenCalledTimes(1)
  })

  /**
   * n−1 leg: nothing unread, nothing written.
   *
   * MUST FAIL ON: NotificationCenter.tsx — drop the `unreadCount > 0` guard.
   */
  it('writes nothing when there is nothing unread to read', async () => {
    server = [receipt('a', 'Alpha alert', true), receipt('b', 'Beta alert', true)]
    render(<NotificationCenter />)
    await openPanel()
    await screen.findByText('Alpha alert')
    expect(markAllReadApi).not.toHaveBeenCalled()
  })

  /**
   * MUST FAIL ON: NotificationCenter.tsx — put the header's
   * `<button aria-label="Mark all notifications as read">` back.
   */
  it('has no Mark all read control — opening is the read', async () => {
    render(<NotificationCenter />)
    const panel = await openPanel()
    await screen.findByText('Alpha alert')
    expect(screen.queryByRole('button', { name: /mark all/i })).toBeNull()
    expect(screen.queryByText('Mark all read')).toBeNull()
    // Structural, not by name: the header row holds the title and NOTHING
    // else — a control under any wording would show up here.
    const header = panel.querySelector(':scope > div:first-child') as HTMLElement
    expect(within(header).getByRole('heading', { name: 'Notifications' })).toBeInTheDocument()
    expect(header.querySelectorAll('button, a, [role="button"]')).toHaveLength(0)
    expect(header.children).toHaveLength(1)
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
    await screen.findByRole('dialog') // opening reads

    // The count the OTHER mount renders changes too — one store, one truth.
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: 'Notifications' })).toHaveLength(2),
    )
    expect(screen.queryAllByRole('button', { name: 'Notifications, 1 unread' })).toEqual([])
    // One store also means one write, not one per mount.
    expect(markAllReadApi).toHaveBeenCalledTimes(1)
  })
})
