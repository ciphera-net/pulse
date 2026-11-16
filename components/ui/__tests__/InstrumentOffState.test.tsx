import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { InstrumentOffState } from '../InstrumentOffState'

// The shared instrument-off shell (closeout ruling 1b, V2). What these pin:
// the ghost rails preview, Pulse's one empty state beside them (R57, 16-11-2026:
// the icon alone, the action in the bordered button), and — the part that
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
  it('renders ghost rails with em dashes beside the one empty state, its icon without a tile', () => {
    const { container } = render(
      <InstrumentOffState {...base} canAct action={{ label: 'Connect', href: '/settings' }} />,
    )
    expect(screen.getByText('Clicks')).toBeTruthy()
    expect(screen.getByText('Impressions')).toBeTruthy()
    expect(container.textContent).toContain('—')
    expect(container.querySelector('[data-empty-state]')).not.toBeNull()
    const glyph = screen.getByTestId('glyph').parentElement!
    expect(glyph.className).toContain('text-brand-ink')
    expect(glyph.className).not.toContain('bg-neutral-800')
    expect(screen.getByRole('heading', { name: 'Connect the thing' })).toBeTruthy()
  })

  it('href action renders a link in the bordered button', () => {
    render(<InstrumentOffState {...base} canAct action={{ label: 'Connect in Settings', href: '/settings/site/integrations' }} />)
    const link = screen.getByRole('link', { name: 'Connect in Settings' })
    expect(link.getAttribute('href')).toBe('/settings/site/integrations')
    expect(link.className.split(' ')).toEqual(expect.arrayContaining(['border-input', 'bg-card']))
    expect(link.className.split(' ')).not.toContain('bg-primary')
  })

  it('holds an action that acts in place while it runs', () => {
    render(<InstrumentOffState {...base} canAct action={{ label: 'Enable it', onClick: () => {}, disabled: true }} />)
    expect((screen.getByRole('button', { name: 'Enable it' }) as HTMLButtonElement).disabled).toBe(true)
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
