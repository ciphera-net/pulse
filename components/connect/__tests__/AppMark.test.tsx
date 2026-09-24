import { describe, it, expect } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { AppMark, BRAND_MARKS } from '../AppMark'
import type { ClientBrand } from '@/lib/api/connect'

// The connecting app's mark (PULSE-41/42, options doc "Logos"). A brand comes
// only from an identity pulse-backend verified (mcpClientBrand); this pins the
// frontend half of that contract.

// * pulse-backend's vocabulary (internal/api/mcp_clients.go, mcpClientBrand).
// * A brand the server can name must have a mark here, or a verified app is
// * drawn as an unverified one.
const SERVER_BRANDS: ClientBrand[] = ['claude', 'chatgpt', 'cursor', 'vscode']

describe('AppMark', () => {
  it('has a versioned mark for every brand the server can name', () => {
    expect(Object.keys(BRAND_MARKS).sort()).toEqual([...SERVER_BRANDS].sort())
    for (const b of SERVER_BRANDS) {
      // * a changed logo gets a NEW name — never new bytes at a cached path
      expect(BRAND_MARKS[b], b).toMatch(new RegExp(`^/connect/${b}-v\\d+\\.(svg|png)$`))
    }
  })

  it('draws the brand mark for a verified app', () => {
    const { container } = render(<AppMark name="Visual Studio Code" brand="vscode" size={36} />)
    const img = container.querySelector('img[data-brand="vscode"]') as HTMLImageElement
    expect(img).toBeTruthy()
    expect(img.getAttribute('src')).toContain('/connect/vscode-v1.png')
    expect(container.querySelector('[data-monogram]')).toBeNull()
  })

  it('draws only the monogram when there is no verified brand', () => {
    const { container } = render(<AppMark name="Weekly report bot" brand={null} size={32} />)
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('[data-monogram]')?.textContent).toBe('W')
  })

  it('falls back to the monogram when the mark fails to load', () => {
    const { container } = render(<AppMark name="Claude" brand="claude" size={36} />)
    fireEvent.error(container.querySelector('img') as HTMLImageElement)
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('[data-monogram]')?.textContent).toBe('C')
  })
})
