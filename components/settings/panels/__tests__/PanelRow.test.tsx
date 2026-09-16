import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { PanelRow } from '../PanelRow'

describe('PanelRow (structured-panels PropertyRow)', () => {
  it('stacks to a single column on mobile and only becomes the property grid from md up', () => {
    const { container } = render(
      <PanelRow label="Name" caption="Shown across Pulse">
        <input aria-label="name" />
      </PanelRow>,
    )
    const row = container.firstElementChild as HTMLElement
    // Mobile (< md): one column, so the value takes the full row width — the
    // fixed 220px label column crushed inputs to ~70px at 390px before.
    expect(row.className).toContain('grid-cols-1')
    // The 3-column property grid is gated behind `md` so it never applies at
    // mobile widths. Round two: the label column is minmax(220px,30%), not a
    // fixed 220px, so a caption stops wrapping at 220px however wide the row is.
    expect(row.className).toContain('md:grid-cols-[minmax(220px,30%)_1fr_auto]')
    expect(row.className).not.toContain('md:grid-cols-[220px_1fr_auto]')
    // A field is a field: the value cell caps at max-w-md instead of filling the column.
    const value = row.children[1] as HTMLElement
    expect(value.className).toMatch(/\bmd:max-w-md\b/)
  })

  it('gives a control-only row its whole width to the label, with the caption capped at a readable measure', () => {
    const { container } = render(
      <PanelRow label="Public dashboard" caption="Allow anyone with the link to view this dashboard." control={<button type="button">toggle</button>} />,
    )
    const row = container.firstElementChild as HTMLElement
    expect(row.className).toContain('md:grid-cols-[minmax(0,1fr)_auto]')
    expect(row.className).not.toContain('minmax(220px,30%)')
    const caption = row.querySelector('p')!
    expect(caption.className).toMatch(/max-w-\[56ch\]/)
  })

  it('does not render an empty value cell for a control-only row', () => {
    const { container, getByRole } = render(
      <PanelRow label="Bot filtering" control={<button type="button">toggle</button>} />,
    )
    const row = container.firstElementChild as HTMLElement
    // Label block + control only — the empty middle div must not stack a blank
    // box beneath the label on mobile.
    expect(row.children.length).toBe(2)
    expect(getByRole('button', { name: 'toggle' })).toBeTruthy()
  })
})
