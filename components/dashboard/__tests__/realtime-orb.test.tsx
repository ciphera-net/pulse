import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import RealtimeOrb, { describeLiveCount } from '../RealtimeOrb'

// * The count and the realtime view are the SAME five minutes now (owner, 25-09-2026),
// * so the phrase names its window rather than leaving "current visitors" to imply a
// * different, unstated one.
describe('describeLiveCount', () => {
  it('names an empty window', () => {
    expect(describeLiveCount(0)).toBe('Nobody on the site in the last 5 minutes')
  })

  it('singularises one visitor', () => {
    expect(describeLiveCount(1)).toBe('1 person on the site in the last 5 minutes')
  })

  it('pluralises more than one', () => {
    expect(describeLiveCount(3)).toBe('3 people on the site in the last 5 minutes')
  })
})

describe('RealtimeOrb as a toggle', () => {
  // * Direction A, approved from the production-mocked options round (25-09-2026,
  // * PULSE-65): nobody here is still a clickable button — the orb is the only way into
  // * realtime, whatever the count.
  it('shows a grey dot and muted text when nobody is here', () => {
    const { container } = render(<RealtimeOrb count={0} live={false} onToggle={() => {}} />)
    const btn = screen.getByRole('button')
    expect(btn.className).toMatch(/text-muted-foreground/)
    expect(container.querySelector('.bg-neutral-400')).not.toBeNull()
    expect(container.querySelector('.animate-ping')).toBeNull()
  })

  // * The halo only animates over a real presence. A pulsing orb with nobody on the site
  // * would be the interface insisting on life it cannot see.
  it('shows the brand dot and its halo when somebody is here', () => {
    const { container } = render(<RealtimeOrb count={3} live={false} onToggle={() => {}} />)
    expect(container.querySelector('.bg-brand-orange')).not.toBeNull()
    expect(container.querySelector('.animate-ping')).not.toBeNull()
  })

  // * The orb IS the switch, and its pressed state is how a keyboard or screen-reader
  // * user knows the page is currently live.
  it('marks the live state with aria-pressed and the accent surface', () => {
    render(<RealtimeOrb count={2} live onToggle={() => {}} />)
    const btn = screen.getByRole('button')
    expect(btn).toHaveAttribute('aria-pressed', 'true')
    expect(btn.className).toMatch(/bg-accent/)
  })

  it('names the destination, not just the count, at each end of the toggle', () => {
    const { rerender } = render(<RealtimeOrb count={2} live={false} onToggle={() => {}} />)
    expect(screen.getByRole('button')).toHaveAccessibleName(/show realtime view$/i)
    rerender(<RealtimeOrb count={2} live onToggle={() => {}} />)
    expect(screen.getByRole('button')).toHaveAccessibleName(/leave realtime view$/i)
  })

  it('fires onToggle on click', () => {
    const onToggle = vi.fn()
    render(<RealtimeOrb count={2} live={false} onToggle={onToggle} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  // * The product tour anchors a step to this attribute (lib/tour/anchors.ts). It moved
  // * with the control rather than being dropped, or the tour would break silently.
  it('keeps the tour anchor', () => {
    render(<RealtimeOrb count={0} live={false} onToggle={() => {}} />)
    expect(screen.getByRole('button')).toHaveAttribute('data-tour', 'realtime-trigger')
  })

  // * Facet reserves the mono face for text that would be meaningful typed into a
  // * terminal. A visitor count is not code; it aligns with tabular-nums instead.
  it('sets the count in tabular figures, never monospace', () => {
    const { container } = render(<RealtimeOrb count={12} live={false} onToggle={() => {}} />)
    const count = container.querySelector('.tabular-nums')
    expect(count).not.toBeNull()
    expect(count?.className).not.toMatch(/font-mono/)
  })

  // * The approved design drops the boxed chip entirely ("smaller, same place") — a
  // * border here would be the old device creeping back in.
  it('has no border', () => {
    render(<RealtimeOrb count={0} live={false} onToggle={() => {}} />)
    expect(screen.getByRole('button').className).not.toMatch(/\bborder\b/)
  })
})

describe('RealtimeOrb on the share page (display-only)', () => {
  // * Realtime MODE stays refused on the public surface (pulse-backend parseLiveWindow,
  // * pending its privacy pass), so the share page's orb must never become a toggle.
  it('renders no button when onToggle is absent', () => {
    render(<RealtimeOrb count={4} />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('is a status region carrying the same phrase a toggle would', () => {
    render(<RealtimeOrb count={4} />)
    const status = screen.getByRole('status')
    expect(status).toHaveAttribute('data-live-orb', 'display')
    expect(status).toHaveAttribute('aria-label', describeLiveCount(4))
  })
})
