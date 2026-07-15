import { describe, it, expect, beforeEach } from 'vitest'
import {
  rememberLastSite,
  getLastSiteId,
  markSessionEntered,
  entryRedirectTarget,
} from '../last-site'

const SITES = ['aaa', 'bbb', 'ccc']

describe('entryRedirectTarget', () => {
  it('redirects to the remembered site on first entry', () => {
    expect(entryRedirectTarget('bbb', SITES, false)).toBe('bbb')
  })

  it('never redirects once the session has entered (keeps "Your Sites" reachable)', () => {
    expect(entryRedirectTarget('bbb', SITES, true)).toBeNull()
  })

  it('does not redirect without a remembered site', () => {
    expect(entryRedirectTarget(null, SITES, false)).toBeNull()
  })

  it('falls back to the list when the remembered site is no longer accessible', () => {
    expect(entryRedirectTarget('deleted-site', SITES, false)).toBeNull()
    expect(entryRedirectTarget('bbb', [], false)).toBeNull()
  })
})

describe('storage round-trip (jsdom)', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  it('remembers and returns the last site id', () => {
    expect(getLastSiteId()).toBeNull()
    rememberLastSite('site-123')
    expect(getLastSiteId()).toBe('site-123')
    rememberLastSite('') // no-op, never store empties
    expect(getLastSiteId()).toBe('site-123')
  })

  it('markSessionEntered is false exactly once per session', () => {
    expect(markSessionEntered()).toBe(false)
    expect(markSessionEntered()).toBe(true)
    expect(markSessionEntered()).toBe(true)
  })

  it('deep-link entry spends the redirect: site page marks entered, home then shows the list', () => {
    // simulates SiteLayoutShell mounting first (deep link), then "/"
    rememberLastSite('site-123')
    markSessionEntered()
    expect(entryRedirectTarget(getLastSiteId(), ['site-123'], markSessionEntered())).toBeNull()
  })
})
