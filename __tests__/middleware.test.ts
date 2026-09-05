import { describe, it, expect } from 'vitest'
import { NextRequest } from 'next/server'
import { middleware } from '../middleware'

function createRequest(path: string, cookies: Record<string, string> = {}): NextRequest {
  const url = new URL(path, 'http://localhost:3000')
  const req = new NextRequest(url)
  for (const [name, value] of Object.entries(cookies)) {
    req.cookies.set(name, value)
  }
  return req
}

describe('middleware', () => {
  describe('public routes', () => {
    const publicPaths = [
      '/',
      '/login',
      '/signup',
      '/auth/callback',
      '/pricing',
      '/features',
      '/about',
      '/faq',
      '/changelog',
      '/installation',
      '/script.js',
    ]

    publicPaths.forEach((path) => {
      it(`allows unauthenticated access to ${path}`, () => {
        const res = middleware(createRequest(path))
        // NextResponse.next() does not set a Location header
        expect(res.headers.get('Location')).toBeNull()
      })
    })
  })

  describe('public prefixes', () => {
    it('allows /share/* without auth', () => {
      const res = middleware(createRequest('/share/abc123'))
      expect(res.headers.get('Location')).toBeNull()
    })

    it('allows /integrations without auth', () => {
      const res = middleware(createRequest('/integrations'))
      expect(res.headers.get('Location')).toBeNull()
    })

    it('allows /docs without auth', () => {
      const res = middleware(createRequest('/docs'))
      expect(res.headers.get('Location')).toBeNull()
    })
  })

  describe('protected routes', () => {
    it('redirects unauthenticated users to /login', () => {
      const res = middleware(createRequest('/sites'))
      expect(res.headers.get('Location')).toContain('/login')
    })

    it('redirects unauthenticated users from /settings to /login', () => {
      const res = middleware(createRequest('/settings'))
      expect(res.headers.get('Location')).toContain('/login')
    })

    it('allows access with the pulse_access cookie (S3, host-only)', () => {
      const res = middleware(createRequest('/sites', { pulse_access: 'tok' }))
      expect(res.headers.get('Location')).toBeNull()
    })

    it('allows access with the pulse_refresh cookie only', () => {
      const res = middleware(createRequest('/sites', { pulse_refresh: 'tok' }))
      expect(res.headers.get('Location')).toBeNull()
    })
  })

  describe('auth-only route redirects', () => {
    it('redirects authenticated user from /login to the authed home', () => {
      const res = middleware(createRequest('/login', { pulse_access: 'tok' }))
      const location = res.headers.get('Location')
      expect(location).not.toBeNull()
      expect(new URL(location!).pathname).toBe('/sites')
    })

    it('redirects authenticated user from /signup to the authed home', () => {
      const res = middleware(createRequest('/signup', { pulse_access: 'tok' }))
      const location = res.headers.get('Location')
      expect(location).not.toBeNull()
      expect(new URL(location!).pathname).toBe('/sites')
    })

    it('does NOT redirect from /login with only pulse_refresh (stale session)', () => {
      const res = middleware(createRequest('/login', { pulse_refresh: 'tok' }))
      // Should allow through to /login since only pulse_refresh is present
      expect(res.headers.get('Location')).toBeNull()
    })
  })
})
