import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'

// M5 (PULSE-140): a GA4 sign-in whose OAuth state fails to verify lands the
// Google popup on the ROOT (`/?ga4=invalid_state`; signed in, the middleware
// carries the code on to /sites). Like the `?gsc=` result on the Integrations
// landing page, the sentence is a toast, and the code is scrubbed.

vi.mock('@ciphera-net/facet', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { toast } from '@ciphera-net/facet'
import { GA4LandingNotice } from '../GA4LandingNotice'

const INVALID_STATE =
  'Google sign-in took too long, or its link was already used, so nothing was connected. Connect again from the Import tab.'

beforeEach(() => {
  ;(toast.error as any).mockClear()
  ;(toast.success as any).mockClear()
})

describe('the GA4 code on a landing page', () => {
  it('says the ruled invalid_state sentence as a toast and strips the code', () => {
    window.history.replaceState({}, '', '/?ga4=invalid_state&ref=x#top')
    render(<GA4LandingNotice />)
    expect(toast.error).toHaveBeenCalledWith(INVALID_STATE)
    expect(window.location.pathname).toBe('/')
    expect(window.location.search).toBe('?ref=x')
    expect(window.location.hash).toBe('#top')
  })

  it('does the same on /sites, where the signed-in popup lands', () => {
    window.history.replaceState({}, '', '/sites?ga4=invalid_state')
    render(<GA4LandingNotice />)
    expect(toast.error).toHaveBeenCalledWith(INVALID_STATE)
    expect(window.location.search).toBe('')
  })

  it('says nothing without a code, or for a connection that worked', () => {
    window.history.replaceState({}, '', '/')
    render(<GA4LandingNotice />)
    window.history.replaceState({}, '', '/?ga4=connected')
    render(<GA4LandingNotice />)
    expect(toast.error).not.toHaveBeenCalled()
    expect(window.location.search).toBe('')
  })

  it('never shows an unknown code raw', () => {
    window.history.replaceState({}, '', '/?ga4=<b>x</b>')
    render(<GA4LandingNotice />)
    expect(toast.error).toHaveBeenCalledWith('Something unexpected came back from Pulse. Nothing more was saved. Try again.')
  })
})
