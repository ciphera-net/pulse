import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderToString } from 'react-dom/server'
import { render } from '@testing-library/react'

/**
 * pulse.ciphera.net's home page frames /demo for every desktop visitor. A framed page is not a
 * visit, so Pulse's own tracker must not load in it, and the dashboard's service worker must not
 * register from it. A top-level page keeps both (the controls below), so nothing changes for a
 * person on the dashboard or on /demo itself.
 */
let framed = false
vi.mock('@/lib/scope/embed', async (orig) => ({
  ...(await orig<typeof import('@/lib/scope/embed')>()),
  isFramed: () => framed,
}))
vi.mock('next/script', () => ({
  default: (props: Record<string, string>) => <script {...props} />,
}))

import PulseOwnTracker from '@/components/PulseOwnTracker'
import ServiceWorkerRegister from '@/components/ServiceWorkerRegister'

const TRACKER = 'script[src="https://js.ciphera.net/script.js"]'

describe("Pulse's own tracker", () => {
  beforeEach(() => {
    framed = false
  })

  it('loads in a top-level window, with its site and outbound tracking off (control)', () => {
    const { container } = render(<PulseOwnTracker />)
    const tag = container.querySelector(TRACKER)
    expect(tag).not.toBeNull()
    expect(tag!.getAttribute('data-domain')).toBe('pulse.ciphera.net')
    expect(tag!.hasAttribute('data-no-outbound')).toBe(true)
  })

  it('does not load in a frame (the hero on the home page)', () => {
    framed = true
    const { container } = render(<PulseOwnTracker />)
    expect(container.querySelector('script')).toBeNull()
  })

  it('is not in the server HTML (it is decided after mount, as next/script injected it before)', () => {
    expect(renderToString(<PulseOwnTracker />)).not.toContain('js.ciphera.net')
  })
})

describe("the dashboard's service worker", () => {
  const register = vi.fn(() => Promise.resolve())

  beforeEach(() => {
    framed = false
    register.mockClear()
    ;(window as unknown as { workbox?: unknown }).workbox = { register }
  })
  afterEach(() => {
    delete (window as unknown as { workbox?: unknown }).workbox
  })

  it('registers through next-pwa in a top-level window (control)', () => {
    render(<ServiceWorkerRegister />)
    expect(register).toHaveBeenCalledTimes(1)
  })

  it('does not register from a frame', () => {
    framed = true
    render(<ServiceWorkerRegister />)
    expect(register).not.toHaveBeenCalled()
  })

  it('does nothing when next-pwa set up no workbox (dev, or no service-worker support)', () => {
    delete (window as unknown as { workbox?: unknown }).workbox
    expect(() => render(<ServiceWorkerRegister />)).not.toThrow()
    expect(register).not.toHaveBeenCalled()
  })

  it('survives a refused registration', async () => {
    register.mockImplementationOnce(() => Promise.reject(new Error('refused')))
    render(<ServiceWorkerRegister />)
    await Promise.resolve()
    expect(register).toHaveBeenCalledTimes(1)
  })
})
