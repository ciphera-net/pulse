import { describe, it, expect } from 'vitest'
import { classifyPublicView, isProtectedError, type PublicViewTarget } from '@/components/public/usePublicView'
import { FALLBACK_DEMO_SITE_ID, type PublicSiteView } from '@/components/public/site-view'

const err = (status: number, data?: Record<string, unknown>) => Object.assign(new Error(`status ${status}`), { status, data })
const SITE = { id: 's' } as PublicSiteView
const demo: PublicViewTarget = { kind: 'demo' }
const share: PublicViewTarget = { kind: 'share', siteId: 'site-1' }

// What each answer to the public site record means. (components/public/usePublicView.ts has the
// order the backend decides them in.)
describe('classifyPublicView', () => {
  it('is loading until something has been answered', () => {
    expect(classifyPublicView(demo, undefined, undefined)).toEqual({ kind: 'loading' })
    expect(classifyPublicView(share, undefined, null)).toEqual({ kind: 'loading' })
  })

  it('is ready with the view, even if a later refresh failed', () => {
    expect(classifyPublicView(share, SITE, undefined)).toEqual({ kind: 'ready', view: SITE })
    expect(classifyPublicView(share, SITE, err(500))).toEqual({ kind: 'ready', view: SITE })
  })

  describe('the demo', () => {
    it('falls back to the public ciphera.net site on 404 and on nothing else', () => {
      expect(classifyPublicView(demo, undefined, err(404, { error: 'No demo site' }))).toEqual({ kind: 'dashboard-only', siteId: FALLBACK_DEMO_SITE_ID })
      for (const status of [0, 401, 403, 429, 500, 503]) {
        expect(classifyPublicView(demo, undefined, err(status)), String(status)).toEqual({ kind: 'error' })
      }
    })
  })

  describe('a share link', () => {
    it('asks for the password on 401 is_protected, and only then', () => {
      expect(classifyPublicView(share, undefined, err(401, { is_protected: true }))).toEqual({ kind: 'protected', siteId: 'site-1' })
      expect(classifyPublicView(share, undefined, err(401, { error: 'x' }))).toEqual({ kind: 'error' })
      expect(classifyPublicView(share, undefined, err(401, { is_protected: 'yes' }))).toEqual({ kind: 'error' })
    })

    it('is private on 403', () => {
      expect(classifyPublicView(share, undefined, err(403, { error: 'Access denied' }))).toEqual({ kind: 'private' })
    })

    it('is a customer\'s link, dashboard only, on any 404 but `Site not found`', () => {
      expect(classifyPublicView(share, undefined, err(404, { error: 'This page is not shared' }))).toEqual({ kind: 'dashboard-only', siteId: 'site-1' })
      expect(classifyPublicView(share, undefined, err(404))).toEqual({ kind: 'dashboard-only', siteId: 'site-1' })
    })

    it('is missing for `Site not found`, and for an id that is not a UUID (400)', () => {
      expect(classifyPublicView(share, undefined, err(404, { error: 'Site not found' }))).toEqual({ kind: 'missing' })
      expect(classifyPublicView(share, undefined, err(400, { error: 'invalid path parameter: id must be a valid UUID' }))).toEqual({ kind: 'missing' })
    })

    it('is an error for anything else, a network failure included', () => {
      for (const status of [0, 429, 500, 502]) {
        expect(classifyPublicView(share, undefined, err(status)), String(status)).toEqual({ kind: 'error' })
      }
      expect(classifyPublicView(share, undefined, new Error('plain'))).toEqual({ kind: 'error' })
      expect(classifyPublicView(share, undefined, 'a string')).toEqual({ kind: 'error' })
    })
  })
})

describe('isProtectedError', () => {
  it('is a 401 whose body says is_protected: true', () => {
    expect(isProtectedError(err(401, { is_protected: true }))).toBe(true)
  })

  it('is nothing else', () => {
    for (const e of [err(401), err(401, { is_protected: false }), err(403, { is_protected: true }), new Error('x'), null, undefined, 'x']) {
      expect(isProtectedError(e), String(e)).toBe(false)
    }
  })
})
