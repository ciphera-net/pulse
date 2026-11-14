import { describe, it, expect } from 'vitest'
import { render, fireEvent, screen } from '@testing-library/react'
import { SiteFavicon } from '@/components/sites/SiteFavicon'
import { canHaveFavicon, siteFaviconUrl } from '@/lib/utils/favicon'

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

  // A site's favicon is drawn in menus and lists that open on a click. It is requested eagerly, and from one
  // address builder: a preload has to ask for the same address, character for character (14-11-2026).
  it('asks for the picture eagerly, at the address siteFaviconUrl gives', () => {
    const { container } = render(<SiteFavicon domain="ciphera.net" name="Ciphera" size={20} />)
    const img = container.querySelector('img') as HTMLImageElement
    expect(img).not.toBeNull()
    expect(img.getAttribute('loading')).toBe('eager')
    // The test environment resolves the address against its own origin; the path and query are what matter.
    expect(img.getAttribute('src')?.endsWith(siteFaviconUrl('ciphera.net', 20))).toBe(true)
    expect(siteFaviconUrl('ciphera.net', 20)).toBe('/api/favicon?domain=ciphera.net&sz=64')
    expect(siteFaviconUrl('ciphera.net', 64)).toBe('/api/favicon?domain=ciphera.net&sz=128')
  })

  // The demo's sample site lives on `.example`: every load of /demo asked for its favicon and logged a 404.
  it('draws the monogram for a domain that cannot have a favicon, with no request', () => {
    const { container } = render(<SiteFavicon domain="haldencycles.example" name="Halden Cycles" size={20} />)
    expect(container.querySelector('img')).toBeNull()
    expect(container.textContent).toBe('H')
  })
})

describe('canHaveFavicon', () => {
  it('is false for the reserved top-level names only', () => {
    for (const domain of ['haldencycles.example', 'shop.test', 'x.invalid', 'app.localhost', 'A.EXAMPLE']) expect(canHaveFavicon(domain), domain).toBe(false)
    // `example.com` is a real, resolvable domain; only the top-level name is reserved.
    for (const domain of ['ciphera.net', 'example.com', 'test.org', 'contest.dev']) expect(canHaveFavicon(domain), domain).toBe(true)
    expect(canHaveFavicon('')).toBe(false)
    expect(canHaveFavicon(null)).toBe(false)
  })
})
