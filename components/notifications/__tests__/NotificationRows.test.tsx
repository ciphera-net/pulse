/**
 * @file The A2 "Docket" row anatomy, pinned — with the 22-09-2026 rebuild of
 * its dismiss control (PULSE-15, owner pick x1).
 *
 * Owner picked A2 on 30-08-2026 from a mocked options round on production
 * (`Pulse/docs/plans/30-08-2026-bell-room-direction-a-spec.md` §1, §3). These
 * tests pin the parts of that anatomy that a later edit can silently undo:
 * where the unread dot lives, where the time lives, the reserved gutter that
 * keeps the dismiss control off the time — and, since 22-09, that the dismiss
 * control is a real, always-visible icon button rather than a hover-only glyph,
 * plus the two props the /notifications page relies on to render THIS row.
 *
 * 🔴 EVERY `it` CARRIES A `MUST FAIL ON:` LINE — the exact mutation a reviewer
 * applies to watch it go red.
 *
 * ⚠️ jsdom carries no Tailwind, so a geometry claim ("32 px", "the gutter is
 * 24 px wide") is asserted through the utility token that produces it. What is
 * asserted for real, and is where the collision actually came from, is the DOM
 * RELATIONSHIP: which element contains the dot, which element is the time's
 * sibling, and what follows the time. Those hold whatever the CSS does.
 *
 * Facet's `Button`/`XIcon` are stand-ins that forward every prop: the claims
 * here are about the DOM this row builds, not about Facet's own rendering.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import type { Receipt } from '@/lib/notifications/types'

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: any) => <a href={href} {...rest}>{children}</a>,
}))
vi.mock('@ciphera-net/facet', () => ({
  Button: ({ children, variant, size, isLoading, asChild, ...rest }: any) => (
    <button data-variant={variant} data-size={size} {...rest}>{children}</button>
  ),
  XIcon: (p: any) => <svg data-icon="x" {...p} />,
}))

import { NotificationRow, StratumHeader } from '../NotificationRows'

const CREATED_AT = '2026-08-30T08:00:00Z'
const ISO = new Date(CREATED_AT).toISOString()
const DISMISS = /^Dismiss "ciphera.net is down", /

function receipt(read: boolean, link: string | null = null): Receipt {
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
      link_url: link,
      link_label_key: null,
      created_at: CREATED_AT,
      expires_at: '2026-09-30T08:00:00Z',
    },
  }
}

function renderRow(
  opts: { read?: boolean; removing?: boolean; unread?: boolean; timeLabel?: string; meta?: React.ReactNode; link?: string | null } = {},
) {
  const onActivate = vi.fn()
  const onDismiss = vi.fn()
  const utils = render(
    <ul>
      <NotificationRow
        receipt={receipt(opts.read ?? false, opts.link ?? null)}
        title="ciphera.net is down"
        body="Monitor confirmed 3 failed checks."
        unread={opts.unread}
        timeLabel={opts.timeLabel}
        meta={opts.meta}
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
    expect(chip.querySelector('svg')).toBeTruthy()

    const dot = chip.querySelector('.bg-brand-orange') as HTMLElement
    expect(dot).toBeTruthy()
    expect(dot.parentElement).toBe(chip)
    expect(classesOf(dot)).toEqual(
      expect.arrayContaining(['absolute', 'w-2', 'h-2', 'rounded-full']),
    )
    const strays = Array.from(container.querySelectorAll('.bg-brand-orange')).filter(
      (el) => !chip.contains(el),
    )
    expect(strays).toEqual([])
  })

  /**
   * n−1 leg for the dot.
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
   * The bell reads on open (R-B), which sets every live `read_at` in the same
   * frame the panel appears; the row therefore renders the state it is TOLD,
   * so the New signal survives its own reading for as long as the panel does.
   *
   * MUST FAIL ON: NotificationRows.tsx — `const isUnread = !receipt.read_at`
   * (drop the `unread ??`).
   */
  it('renders the read state it is told, not the live one, when `unread` is given', () => {
    const told = renderRow({ read: true, unread: true })
    expect(told.container.querySelectorAll('.bg-brand-orange')).toHaveLength(1)
    expect(classesOf(screen.getByText('ciphera.net is down'))).toEqual(
      expect.arrayContaining(['font-medium', 'text-white']),
    )
    told.unmount()

    const untold = renderRow({ read: false, unread: false })
    expect(untold.container.querySelectorAll('.bg-brand-orange')).toHaveLength(0)
    expect(classesOf(screen.getByText('ciphera.net is down'))).toContain('text-neutral-300')
  })

  /**
   * The time sits on the title line, and the dismiss control is parked over
   * the row's corner; the `w-6 shrink-0` spacer is the reserved gutter that
   * keeps them apart (the 30-08 round's `states.png` showed the collision).
   *
   * MUST FAIL ON: NotificationRows.tsx — delete the
   * `<span className="w-6 shrink-0" aria-hidden="true" />` spacer.
   */
  it('puts the time on the title line and reserves a gutter after it', () => {
    const { container } = renderRow()

    const time = container.querySelector(`[title="${ISO}"]`) as HTMLElement
    expect(time).toBeTruthy()
    const title = screen.getByText('ciphera.net is down')

    expect(time.parentElement).toBe(title.parentElement)
    expect(classesOf(title.parentElement!)).toEqual(
      expect.arrayContaining(['flex', 'items-center', 'justify-between']),
    )
    expect(classesOf(time)).toEqual(expect.arrayContaining(['shrink-0', 'text-neutral-500']))

    const gutter = time.nextElementSibling as HTMLElement
    expect(gutter).toBeTruthy()
    expect(classesOf(gutter)).toEqual(expect.arrayContaining(['w-6', 'shrink-0']))
    expect(gutter).toHaveAttribute('aria-hidden', 'true')
    expect(gutter.nextElementSibling).toBeNull()

    const x = screen.getByRole('button', { name: DISMISS })
    expect(classesOf(x)).toEqual(expect.arrayContaining(['absolute', 'right-2', 'top-3']))
  })

  /**
   * The page passes a clock where the bell passes a relative time, and the
   * category word as the footer line — the same row on both surfaces.
   *
   * MUST FAIL ON: NotificationRows.tsx — ignore the prop:
   * `{formatTimeAgo(receipt.event.created_at)}` in place of `{timeLabel ?? …}`.
   */
  it('renders a given time label and a given meta line', () => {
    const { container } = renderRow({ timeLabel: '15:59', meta: 'Security' })
    const time = container.querySelector(`[title="${ISO}"]`) as HTMLElement
    expect(time).toHaveTextContent('15:59')
    expect(screen.getByText('Security')).toBeInTheDocument()
    expect(classesOf(screen.getByText('Security'))).toEqual(expect.arrayContaining(['text-[11px]', 'text-neutral-500']))
  })
})

describe('NotificationRow — the dismiss control (rebuilt 22-09-2026)', () => {
  /**
   * The previous control was a `×` text glyph, 22 × 24 px on production,
   * `opacity-0` until the row was hovered, labelled "Delete my copy". It is now
   * the house rung for a row-level action — Facet ghost `Button` with `XIcon` —
   * visible at rest, 24 px, and it says what it does.
   *
   * MUST FAIL ON: NotificationRows.tsx — add `opacity-0 group-hover:opacity-100`
   * back to the button's className (or replace `<XIcon …/>` with the glyph `×`).
   */
  it('is a visible, keyboard-reachable Facet ghost icon button labelled Dismiss, named by title and time', () => {
    renderRow({ timeLabel: '15:59' })
    const x = screen.getByRole('button', { name: 'Dismiss "ciphera.net is down", 15:59' })

    expect(x).toHaveAttribute('title', 'Dismiss')
    expect(x).toHaveAttribute('data-variant', 'ghost')
    expect(x).toHaveAttribute('data-size', 'icon')
    expect(x.querySelector('svg[data-icon="x"]')).toBeTruthy()
    expect(x.textContent).toBe('') // an icon, never a glyph

    const c = classesOf(x)
    expect(c).toEqual(expect.arrayContaining(['size-6', 'p-0', 'text-neutral-500']))
    expect(c.some((k) => /opacity-0/.test(k))).toBe(false) // visible at rest — no hover reveal

    x.focus()
    expect(document.activeElement).toBe(x)
  })

  /**
   * A button inside an anchor is invalid HTML — the control is a SIBLING of the
   * row's link, parked over the gutter, and its click never reaches the link.
   *
   * MUST FAIL ON: NotificationRows.tsx — move the `<Button …>` inside `inner`
   * (or drop `e.stopPropagation()` from its onClick).
   */
  it('sits beside the row link, not inside it, and does not activate the row', () => {
    const { container, onActivate, onDismiss } = renderRow({ link: '/sites/s1' })
    const link = container.querySelector('li > a[href="/sites/s1"]') as HTMLElement
    const x = screen.getByRole('button', { name: DISMISS })
    expect(link).toBeTruthy()
    expect(link.contains(x)).toBe(false)
    expect(x.parentElement).toBe(link.parentElement)

    x.click()
    expect(onDismiss).toHaveBeenCalledWith('e1')
    expect(onActivate).not.toHaveBeenCalled()
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
    expect(screen.queryByRole('button', { name: DISMISS })).toBeNull()
    expect(container.querySelector(`[title="${ISO}"]`)).toBeNull()
    const controls = container.querySelectorAll('li > button')
    expect(controls).toHaveLength(1)
    expect(controls[0]).toBeDisabled()
  })

  /**
   * n−1 leg.
   *
   * MUST FAIL ON: NotificationRows.tsx — pin the row into the pending state:
   * rename the prop in the destructure to `removing: _r` and add
   * `const removing = true` as the function's first line.
   */
  it('shows the time and the dismiss control when nothing is in flight', () => {
    const { container } = renderRow({ removing: false })

    expect(screen.queryByText('Removing…')).toBeNull()
    expect(container.querySelector(`[title="${ISO}"]`)).toBeTruthy()
    expect(screen.getByRole('button', { name: DISMISS })).toBeInTheDocument()
    expect(classesOf(screen.getByText('ciphera.net is down'))).not.toContain('text-neutral-600')
    const controls = container.querySelectorAll('li > button')
    expect(controls).toHaveLength(2)
    expect(controls[0]).not.toBeDisabled()
  })
})

describe('StratumHeader', () => {
  /**
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
