import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { InstrumentOffState } from '../InstrumentOffState'

// The shared instrument-off shell (closeout ruling 1b, V2). What these pin:
// the ghost rails preview, the standardized icon tile, and — the part that
// was broken on two of the four pages before consolidation — the permission
// gate: without the capability the action is NOT offered and the fallback
// line says who can.

const base = {
  rails: ['Clicks', 'Impressions'],
  icon: <svg data-testid="glyph" />,
  heading: 'Connect the thing',
  body: 'What you get once connected.',
}

afterEach(cleanup)

describe('InstrumentOffState', () => {
  it('renders ghost rails with em dashes and the icon tile', () => {
    const { container } = render(
      <InstrumentOffState {...base} canAct action={{ label: 'Connect', href: '/settings' }} />,
    )
    expect(screen.getByText('Clicks')).toBeTruthy()
    expect(screen.getByText('Impressions')).toBeTruthy()
    expect(container.textContent).toContain('—')
    const tile = screen.getByTestId('glyph').parentElement!
    expect(tile.className).toContain('bg-neutral-800')
  })

  it('href action renders a link CTA with the primary button anatomy', () => {
    render(<InstrumentOffState {...base} canAct action={{ label: 'Connect in Settings', href: '/settings/site/integrations' }} />)
    const link = screen.getByRole('link', { name: 'Connect in Settings' })
    expect(link.getAttribute('href')).toBe('/settings/site/integrations')
  })

  it('onClick action renders a Button that fires', () => {
    const onClick = vi.fn()
    render(<InstrumentOffState {...base} canAct action={{ label: 'Enable it', onClick }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Enable it' }))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('without the capability: no action offered, fallback line instead', () => {
    render(
      <InstrumentOffState
        {...base}
        canAct={false}
        action={{ label: 'Connect', href: '/settings' }}
        fallback="An owner or admin can connect it."
      />,
    )
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByText('An owner or admin can connect it.')).toBeTruthy()
  })

  it('renders the config slot between body and CTA', () => {
    render(
      <InstrumentOffState
        {...base}
        canAct
        action={{ label: 'Enable', onClick: () => {} }}
        config={<div data-testid="config-slot">frequency</div>}
      />,
    )
    expect(screen.getByTestId('config-slot')).toBeTruthy()
  })
})
