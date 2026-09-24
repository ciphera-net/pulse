import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
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
  // Settings tail, item 9 (17-09-2026): a non-native control in the `control`
  // slot (Facet's Toggle is a role="switch" button, which a <label htmlFor>
  // cannot name) is labelled by the row's label text via aria-labelledby.
  describe('names a non-native control after the row label', () => {
    it('clones the control with aria-labelledby pointing at the label text', () => {
      render(
        <PanelRow label="Public dashboard" caption="Anyone with the link can view." control={<button type="button" role="switch" aria-checked="false" />} />,
      )
      const sw = screen.getByRole('switch', { name: 'Public dashboard' })
      const labelId = sw.getAttribute('aria-labelledby')
      expect(labelId).toBeTruthy()
      expect(document.getElementById(labelId!)).toHaveTextContent('Public dashboard')
      // The caption is not part of the name.
      expect(sw).not.toHaveAccessibleName(/Anyone with the link/)
    })

    it('leaves a control that names itself alone', () => {
      render(<PanelRow label="Row label" control={<button type="button" role="switch" aria-checked="true" aria-label="Own name" />} />)
      const sw = screen.getByRole('switch', { name: 'Own name' })
      expect(sw).not.toHaveAttribute('aria-labelledby')
    })

    it('keeps the semantic <label htmlFor> for native controls and still exposes the id', () => {
      render(
        <PanelRow label="Site name" htmlFor="site-name">
          <input id="site-name" />
        </PanelRow>,
      )
      const input = screen.getByLabelText('Site name')
      expect(input).toHaveAttribute('id', 'site-name')
      expect(document.querySelector('label[for="site-name"]')).toHaveAttribute('id')
    })
  })


  it('puts a leading mark before the label AND the caption, centred across both', () => {
    const { container } = render(
      <PanelRow leading={<span data-testid="mark" />} label="Claude" caption="Connected by you" control={<button type="button">x</button>} />,
    )
    const cell = container.firstElementChild!.firstElementChild as HTMLElement
    const wrap = cell.firstElementChild as HTMLElement
    expect(wrap.className).toContain('items-center')
    expect(wrap.firstElementChild?.getAttribute('data-testid')).toBe('mark')
    const text = wrap.children[1] as HTMLElement
    expect(text.textContent).toBe('ClaudeConnected by you')
  })

  it('renders a row without a leading mark exactly as before: label then caption, no wrapper', () => {
    const { container } = render(<PanelRow label="Name" caption="Shown across Pulse" />)
    const cell = container.firstElementChild!.firstElementChild as HTMLElement
    expect(cell.children).toHaveLength(2)
    expect(cell.children[0].textContent).toBe('Name')
    expect(cell.children[1].tagName).toBe('P')
  })
})
