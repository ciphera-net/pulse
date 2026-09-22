import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import RealtimeOrb from '../RealtimeOrb'

describe('RealtimeOrb', () => {
  // * The approved design drops the visible label and shows the count alone, which is
  // * exactly what makes the accessible name load-bearing rather than decorative: a lone
  // * digit in a toolbar tells a screen-reader user nothing at all.
  it('names the bare count for assistive tech', () => {
    render(<RealtimeOrb count={12} live={false} onToggle={() => {}} />)
    const btn = screen.getByRole('button')
    expect(btn).toHaveAccessibleName(/12 current visitors/i)
    expect(btn).toHaveAttribute('title', '12 current visitors')
    expect(btn).toHaveTextContent('12')
  })

  it('singularises one visitor', () => {
    render(<RealtimeOrb count={1} live={false} onToggle={() => {}} />)
    expect(screen.getByRole('button')).toHaveAccessibleName(/1 current visitor\b/i)
  })

  // * 🔴 The halo must not animate over a zero. A pulsing orb with nobody on the site is
  // * the interface insisting on life it cannot see.
  it('does not animate the halo when nobody is here', () => {
    const { container } = render(<RealtimeOrb count={0} live={false} onToggle={() => {}} />)
    expect(container.querySelector('.animate-ping')).toBeNull()
  })

  it('animates the halo when somebody is here', () => {
    const { container } = render(<RealtimeOrb count={3} live={false} onToggle={() => {}} />)
    expect(container.querySelector('.animate-ping')).not.toBeNull()
  })

  // * The orb IS the switch, and its pressed state is how a keyboard or screen-reader user
  // * knows the dashboard is currently live.
  it('reports and toggles the live state', () => {
    const onToggle = vi.fn()
    const { rerender } = render(<RealtimeOrb count={2} live={false} onToggle={onToggle} />)
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(screen.getByRole('button'))
    expect(onToggle).toHaveBeenCalledTimes(1)

    rerender(<RealtimeOrb count={2} live onToggle={onToggle} />)
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button')).toHaveAccessibleName(/leave realtime/i)
  })

  // * The product tour anchors a step to this attribute. It moved with the control rather
  // * than being dropped; without it the tour breaks silently.
  it('keeps the tour anchor', () => {
    render(<RealtimeOrb count={0} live={false} onToggle={() => {}} />)
    expect(screen.getByRole('button')).toHaveAttribute('data-tour', 'realtime-trigger')
  })

  // * Facet reserves the mono face for text that would be meaningful typed into a terminal.
  // * A visitor count is not code; it aligns with tabular-nums.
  it('sets the count in tabular figures, never monospace', () => {
    const { container } = render(<RealtimeOrb count={12} live={false} onToggle={() => {}} />)
    const count = container.querySelector('.tabular-nums')
    expect(count).not.toBeNull()
    expect(count?.className).not.toMatch(/font-mono/)
  })
})
