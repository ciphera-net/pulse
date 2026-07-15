import { describe, it, expect } from 'vitest'
import { render, fireEvent, screen } from '@testing-library/react'
import { SiteFavicon } from '@/components/sites/SiteFavicon'

describe('SiteFavicon', () => {
  it('renders the favicon proxy image while it loads', () => {
    const { container } = render(<SiteFavicon domain="pulse.ciphera.net" name="Pulse" size={20} />)
    const img = container.querySelector('img')
    expect(img).toBeTruthy()
    expect(img!.getAttribute('src')).toContain('domain=pulse.ciphera.net')
  })

  it('swaps to a self-sized monogram when the proxy 404s (uncrawled domains)', () => {
    const { container } = render(<SiteFavicon domain="id.ciphera.net" name="CipheraID" size={18} />)
    fireEvent.error(container.querySelector('img')!)
    expect(container.querySelector('img')).toBeNull()
    const tile = screen.getByText('C')
    // * self-sizing matters: consumers like the sidebar and command palette
    // * render it inline with no sized wrapper around it
    expect(tile.style.width).toBe('18px')
    expect(tile.style.height).toBe('18px')
  })

  it('falls back to the domain initial when the site has no name', () => {
    const { container } = render(<SiteFavicon domain="example.com" size={20} />)
    fireEvent.error(container.querySelector('img')!)
    expect(screen.getByText('E')).toBeTruthy()
  })
})
