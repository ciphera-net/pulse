import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CompactNumber } from '../compact-number'

// PULSE-190 (owner ruling D11, 01-10-2026): the compact-text / exact-on-hover
// device, mocked in Pulse/docs/data/01-10-2026-number-format-mocks/ — the
// manifest's own accessibility assertion is what "aria-label equals the exact
// value" below reproduces:
//   { "kpiVisibleText": "4.2M", "kpiAccessibleName": "4,218,903" }

describe('CompactNumber', () => {
  it('renders the exact value below the 10,000 threshold with no tooltip trigger', () => {
    render(<CompactNumber value={9876} />)
    const el = screen.getByText('9,876')
    expect(el.tagName).toBe('SPAN')
    expect(el).not.toHaveAttribute('aria-label')
    expect(el).not.toHaveAttribute('tabindex')
  })

  it('renders compact text above the threshold, with the exact value as the accessible name', () => {
    render(<CompactNumber value={4218903} />)
    const el = screen.getByText('4.2M')
    expect(el).toHaveAttribute('aria-label', '4,218,903')
    expect(el).toHaveAttribute('tabindex', '0')
    expect(el.className).toContain('cursor-help')
  })

  it('reveals the exact value on focus (keyboard-reachable, not only a mouse hover)', () => {
    render(<CompactNumber value={2104559} />)
    const trigger = screen.getByText('2.1M')
    fireEvent.focus(trigger)
    expect(screen.getAllByText('2,104,559').length).toBeGreaterThan(0)
  })

  it('renders the em dash for null/undefined — never a fabricated zero', () => {
    const { rerender } = render(<CompactNumber value={null} />)
    expect(screen.getByText('—')).toBeTruthy()
    rerender(<CompactNumber value={undefined} />)
    expect(screen.getByText('—')).toBeTruthy()
  })

  it('is always tabular-nums, never font-mono (Facet typography rule)', () => {
    render(<CompactNumber value={918330} className="text-sm" />)
    const el = screen.getByText('918K')
    expect(el.className).toContain('tabular-nums')
    expect(el.className).not.toContain('font-mono')
  })

  it('keeps tabular-nums and the caller className below the threshold too', () => {
    render(<CompactNumber value={42} className="text-sm font-semibold" />)
    const el = screen.getByText('42')
    expect(el.className).toContain('tabular-nums')
    expect(el.className).toContain('text-sm')
    expect(el.className).not.toContain('font-mono')
  })

  it('supports a custom renderer (e.g. AnimatedNumber) while still carrying the exact aria-label', () => {
    render(
      <CompactNumber value={4218903}>
        <span data-testid="custom">4.2M</span>
      </CompactNumber>
    )
    const custom = screen.getByTestId('custom')
    const wrapper = custom.closest('[aria-label]')
    expect(wrapper).toHaveAttribute('aria-label', '4,218,903')
  })

  it('a custom renderer below the threshold needs no tooltip wrapper', () => {
    render(
      <CompactNumber value={42}>
        <span data-testid="custom">42</span>
      </CompactNumber>
    )
    expect(screen.getByTestId('custom').closest('[aria-label]')).toBeNull()
  })
})
