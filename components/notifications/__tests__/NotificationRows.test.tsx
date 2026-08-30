/**
 * @file The A2 "Docket" row anatomy, pinned.
 *
 * Owner picked A2 on 30-08-2026 from a mocked options round on production
 * (`Pulse/docs/plans/30-08-2026-bell-room-direction-a-spec.md` §1, §3). These
 * tests pin the parts of that anatomy that a later edit can silently undo:
 * where the unread dot lives, where the time lives, and the reserved gutter
 * that keeps the dismiss control off the time.
 *
 * 🔴 EVERY `it` CARRIES A `MUST FAIL ON:` LINE — the exact mutation a reviewer
 * applies to watch it go red.
 *
 * ⚠️ jsdom carries no Tailwind, so a geometry claim ("32 px", "the gutter is
 * 16 px wide") is asserted through the utility token that produces it. What is
 * asserted for real, and is where the collision actually came from, is the DOM
 * RELATIONSHIP: which element contains the dot, which element is the time's
 * sibling, and what follows the time. Those hold whatever the CSS does.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import type { Receipt } from '@/lib/notifications/types'

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: any) => <a href={href} {...rest}>{children}</a>,
}))

import { NotificationRow, StratumHeader } from '../NotificationRows'

const CREATED_AT = '2026-08-30T08:00:00Z'
const ISO = new Date(CREATED_AT).toISOString()

function receipt(read: boolean): Receipt {
  return {
    user_id: 'u1',
    event_id: 'e1',
    delivered_at: null,
    read_at: read ? '2026-08-30T09:00:00Z' : null,
    event: {
      id: 'e1',
      organization_id: 'o1',
      type: 'uptime_monitor_down',
      payload: { monitor_id: 'm1', site_id: 's1', status_code: 503 } as any,
      link_url: null,
      link_label_key: null,
      created_at: CREATED_AT,
      expires_at: '2026-09-30T08:00:00Z',
    },
  }
}

function renderRow(opts: { read?: boolean; removing?: boolean } = {}) {
  const onActivate = vi.fn()
  const onDismiss = vi.fn()
  const utils = render(
    <ul>
      <NotificationRow
        receipt={receipt(opts.read ?? false)}
        title="ciphera.net is down"
        body="Monitor confirmed 3 failed checks."
        removing={opts.removing ?? false}
        onActivate={onActivate}
        onDismiss={onDismiss}
      />
    </ul>,
  )
  return { ...utils, onActivate, onDismiss }
}

const classesOf = (el: Element) => (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)

describe('NotificationRow — A2 anatomy', () => {
  /**
   * The chip is the category carrier, and A2's whole premise is that the unread
   * dot docks IN ITS CORNER rather than washing the row.
   *
   * MUST FAIL ON: NotificationRows.tsx — move the dot out of the chip and make
   * it the row's leading column instead (cut the `{isUnread && <span …/>}` block
   * out of the chip <span> and paste it directly before the chip). Everything
   * still "renders a dot"; the containment assertion is what notices.
   */
  it('puts the type icon in a 32px chip and the unread dot inside it', () => {
    const { container } = renderRow()

    const chip = container.querySelector('span.w-8.h-8') as HTMLElement
    expect(chip).toBeTruthy()
    expect(classesOf(chip)).toEqual(expect.arrayContaining(['w-8', 'h-8', 'shrink-0', 'relative']))
    // The chip carries the category — a chip with no icon is not a chip.
    expect(chip.querySelector('svg')).toBeTruthy()

    const dot = chip.querySelector('.bg-brand-orange') as HTMLElement
    expect(dot).toBeTruthy()
    expect(dot.parentElement).toBe(chip)                       // INSIDE the chip…
    expect(classesOf(dot)).toEqual(
      expect.arrayContaining(['absolute', 'w-2', 'h-2', 'rounded-full']),  // …absolutely positioned
    )
    // Not on the row: the <li> has no dot of its own outside the chip.
    const strays = Array.from(container.querySelectorAll('.bg-brand-orange')).filter(
      (el) => !chip.contains(el),
    )
    expect(strays).toEqual([])
  })

  /**
   * n−1 leg for the dot. Without it, "the dot is inside the chip" would also
   * pass against a row that draws a dot on every receipt, read or not.
   *
   * MUST FAIL ON: NotificationRows.tsx — `const isUnread = true`.
   */
  it('draws no dot on a read row, but keeps the chip and its icon', () => {
    const { container } = renderRow({ read: true })

    const chip = container.querySelector('span.w-8.h-8') as HTMLElement
    expect(chip).toBeTruthy()
    expect(chip.querySelector('svg')).toBeTruthy()
    expect(container.querySelectorAll('.bg-brand-orange')).toHaveLength(0)
    expect(classesOf(screen.getByText('ciphera.net is down'))).toContain('text-neutral-300')
  })

  /**
   * The time moved ONTO the title line, and that is what created the collision:
   * the dismiss control kept its absolute `right-2 top-3` while the time arrived
   * underneath it (visible twice in the options round's `states.png`). The
   * `w-4 shrink-0` spacer is the reserved gutter that fixes it.
   *
   * MUST FAIL ON: NotificationRows.tsx — delete the
   * `<span className="w-4 shrink-0" aria-hidden="true" />` spacer.
   */
  it('puts the time on the title line and reserves a gutter after it', () => {
    const { container } = renderRow()

    const time = container.querySelector(`[title="${ISO}"]`) as HTMLElement
    expect(time).toBeTruthy()
    const title = screen.getByText('ciphera.net is down')

    // Same line, not stacked: one flex row holds both.
    expect(time.parentElement).toBe(title.parentElement)
    expect(classesOf(title.parentElement!)).toEqual(
      expect.arrayContaining(['flex', 'items-center', 'justify-between']),
    )
    expect(classesOf(time)).toEqual(expect.arrayContaining(['shrink-0', 'text-neutral-500']))

    // The gutter: it FOLLOWS the time, it is the last thing on the line, and it
    // is decorative.
    const gutter = time.nextElementSibling as HTMLElement
    expect(gutter).toBeTruthy()
    expect(classesOf(gutter)).toEqual(expect.arrayContaining(['w-4', 'shrink-0']))
    expect(gutter).toHaveAttribute('aria-hidden', 'true')
    expect(gutter.nextElementSibling).toBeNull()

    // ...and the thing it is reserving space FOR is really parked over that
    // corner. Without this half, the spacer is an unexplained empty span.
    const x = screen.getByRole('button', { name: 'Delete my copy of "ciphera.net is down"' })
    expect(classesOf(x)).toEqual(expect.arrayContaining(['absolute', 'right-2', 'top-3']))
  })
})

describe('NotificationRow — the dismissed-pending state', () => {
  /**
   * Spec §1.3: the row is NOT removed until the server confirms. It recedes to
   * `text-neutral-600`, says `Removing…` where the time was, goes inert, and the
   * destructive control is taken away so it cannot be pressed twice.
   *
   * MUST FAIL ON: NotificationRows.tsx — change the guard on the dismiss button
   * from `{!removing && (` to `{true && (`.
   */
  it('recedes, says Removing…, and takes the dismiss control away', () => {
    const { container } = renderRow({ removing: true })

    expect(screen.getByText('Removing…')).toBeInTheDocument()
    expect(classesOf(screen.getByText('ciphera.net is down'))).toContain('text-neutral-600')
    expect(
      screen.queryByRole('button', { name: 'Delete my copy of "ciphera.net is down"' }),
    ).toBeNull()
    // "Removing…" takes the time's slot rather than joining it.
    expect(container.querySelector(`[title="${ISO}"]`)).toBeNull()
    // Inert: the row's own activate control cannot fire while the DELETE is out.
    // Selected positionally, not by name — the dismiss control's aria-label
    // quotes the title, so a name matcher would match both.
    const controls = container.querySelectorAll('li > button')
    expect(controls).toHaveLength(1) // the dismiss control is genuinely gone
    expect(controls[0]).toBeDisabled()
  })

  /**
   * n−1 leg. Every assertion above is a NEGATIVE or a substitution; this is the
   * case that must still pass, and it is what stops the block passing against a
   * row that renders nothing.
   *
   * MUST FAIL ON: NotificationRows.tsx — pin the row into the pending state:
   * rename the prop in the destructure to `removing: _r` and add
   * `const removing = true` as the function's first line.
   */
  it('shows the time and the dismiss control when nothing is in flight', () => {
    const { container } = renderRow({ removing: false })

    expect(screen.queryByText('Removing…')).toBeNull()
    expect(container.querySelector(`[title="${ISO}"]`)).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Delete my copy of "ciphera.net is down"' }),
    ).toBeInTheDocument()
    expect(classesOf(screen.getByText('ciphera.net is down'))).not.toContain('text-neutral-600')
    const controls = container.querySelectorAll('li > button')
    expect(controls).toHaveLength(2) // activate + dismiss
    expect(controls[0]).not.toBeDisabled()
  })
})

describe('StratumHeader', () => {
  /**
   * The header is chrome, not machine data. Mono on a section kicker is the #1
   * tell of a generic page and is banned by the house typography rule.
   *
   * MUST FAIL ON: NotificationRows.tsx — add `font-mono` to StratumHeader's
   * className.
   */
  it('renders its label as sans chrome, never mono', () => {
    const { container } = render(<ul><StratumHeader>New</StratumHeader></ul>)
    const li = within(container).getByText('New')
    expect(classesOf(li)).toEqual(
      expect.arrayContaining(['uppercase', 'tracking-wider', 'text-neutral-500']),
    )
    expect(classesOf(li)).not.toContain('font-mono')
  })
})
