// /demo and a share link own their whole viewport (PUL-34): their own layouts mount the public
// shell, so the app's layout adds nothing around them, for a signed-in reader as for an
// anonymous one. The branch is decided by the path alone, never by the session or by which
// auth state has loaded, because the edge caches /demo* for 300 s under a key that ignores
// cookies.
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

let pathname = '/demo'
vi.mock('next/navigation', () => ({ usePathname: () => pathname }))
type WithChildren = { children?: React.ReactNode }
vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a href={href} {...rest}>{children}</a>,
}))
vi.mock('framer-motion', () => ({
  MotionConfig: ({ children }: WithChildren) => <>{children}</>,
}))

// Distinguishable chrome: the assertions below are about what is NOT drawn.
vi.mock('@/components/VersionToast', () => ({ default: () => null }))
vi.mock('@/components/theme/ThemeSync', () => ({ default: () => null }))
vi.mock('@/components/OfflineBanner', () => ({ OfflineBanner: () => <div data-testid="offline" /> }))
vi.mock('@/components/Footer', () => ({ Footer: () => <div data-testid="marketing-footer" /> }))
vi.mock('@/components/marketing/Header', () => ({ Header: () => <div data-testid="marketing-header" /> }))
vi.mock('@/components/auth/SessionTakeover', () => ({ default: () => <div data-testid="takeover" /> }))
vi.mock('@/components/dashboard/DashboardChrome', () => ({
  default: ({ children }: WithChildren) => <div data-testid="member-shell">{children}</div>,
}))
vi.mock('@/components/settings/active-site', () => ({
  ActiveSiteProvider: ({ children }: WithChildren) => <>{children}</>,
}))
vi.mock('@/lib/hooks/useOnlineStatus', () => ({ useOnlineStatus: () => true }))

type Auth = { user: { id: string } | null; loading: boolean; recovering: boolean }
let auth: Auth = { user: null, loading: false, recovering: false }
vi.mock('@/lib/auth/context', () => ({ useAuth: () => auth }))

import LayoutContent from '../layout-content'

const page = <div data-testid="page">the page</div>

function renderAt(path: string) {
  pathname = path
  return render(<LayoutContent>{page}</LayoutContent>)
}

const PUBLIC_PATHS = ['/demo', '/demo/pages', '/demo/funnels/f-1', '/share/abc', '/share/abc/pages', '/share/abc/funnels/f-1']
const SIGNED_IN: Auth = { user: { id: 'u1' }, loading: false, recovering: false }
const ANONYMOUS: Auth = { user: null, loading: false, recovering: false }
const LOADING: Auth = { user: null, loading: true, recovering: false }

beforeEach(() => {
  auth = ANONYMOUS
})

describe('the public site pages in the app layout', () => {
  for (const [who, state] of [['anonymous', ANONYMOUS], ['signed-in', SIGNED_IN], ['still-loading', LOADING]] as const) {
    it.each(PUBLIC_PATHS)(`renders %s for a ${who} visitor with no marketing header or footer and no member shell`, (path) => {
      auth = state
      renderAt(path)
      expect(screen.getByTestId('page')).toBeInTheDocument()
      for (const id of ['marketing-header', 'marketing-footer', 'member-shell', 'takeover']) {
        expect(screen.queryByTestId(id), id).toBeNull()
      }
    })
  }

  it('draws exactly the same thing whoever is looking', () => {
    const html = (state: Auth) => {
      auth = state
      const view = renderAt('/demo/pages')
      const out = view.container.innerHTML
      view.unmount()
      return out
    }
    expect(html(SIGNED_IN)).toBe(html(ANONYMOUS))
    expect(html(LOADING)).toBe(html(ANONYMOUS))
  })
})

// The controls: the same layout still wraps everything that is not a public site page.
describe('control: everything else keeps its chrome', () => {
  it('wraps a marketing-style page for an anonymous visitor in the header and footer', () => {
    auth = ANONYMOUS
    renderAt('/login')
    expect(screen.getByTestId('marketing-header')).toBeInTheDocument()
    expect(screen.getByTestId('marketing-footer')).toBeInTheDocument()
    expect(screen.getByTestId('page')).toBeInTheDocument()
  })

  it('does the same for a look-alike path', () => {
    for (const path of ['/demonstration', '/share', '/shared/abc']) {
      auth = SIGNED_IN
      const view = renderAt(path)
      expect(screen.getByTestId('marketing-header'), path).toBeInTheDocument()
      view.unmount()
    }
  })

  it('mounts the member shell on a site page for a signed-in visitor', () => {
    auth = SIGNED_IN
    renderAt('/sites/s1')
    expect(screen.getByTestId('member-shell')).toBeInTheDocument()
  })

  it('shows the takeover on a site page with no session', () => {
    auth = ANONYMOUS
    renderAt('/sites/s1')
    expect(screen.getByTestId('takeover')).toBeInTheDocument()
  })
})
