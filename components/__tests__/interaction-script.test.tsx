import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { renderToString } from 'react-dom/server'
import { render } from '@testing-library/react'

/**
 * The interaction-capture companion records the label of a clicked control. In
 * the app that label can be a site or team name, so it loads on the signed-out
 * pages only — decided by a pathname allow-list, with the page HTML as the
 * evidence.
 */
let mockPath = '/'
vi.mock('next/navigation', () => ({ usePathname: () => mockPath }))
vi.mock('next/script', () => ({
  default: ({ src }: { src: string }) => <script src={src} />,
}))

import InteractionScript from '@/components/InteractionScript'
import { isInteractionCaptureRoute } from '@/lib/auth/appRoutes'

const SCRIPT = 'script.interactions.js'

function htmlAt(path: string): string {
  mockPath = path
  return renderToString(<InteractionScript />)
}

function pagePaths(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      if (name !== '__tests__' && name !== 'api') pagePaths(full, out)
    } else if (name === 'page.tsx') {
      const route = '/' + relative(join(process.cwd(), 'app'), dir)
      out.push(route.replace(/\[[^\]]+\]/g, 'x'))
    }
  }
  return out
}

describe('script.interactions.js', () => {
  it('is in the HTML of the signed-out pages', () => {
    for (const path of ['/', '/demo', '/login', '/signup']) {
      expect(htmlAt(path), path).toContain(SCRIPT)
    }
  })

  it('is in the HTML of no app route', () => {
    for (const path of [
      '/sites', '/sites/abc-123', '/sites/abc-123/visitors', '/sites/new', '/notifications',
      '/settings', '/settings/account/profile', '/settings/organization/members',
      '/setup/org', '/switch', '/connect', '/join/abc', '/r/abc', '/share/abc', '/auth/callback',
      '/checkout', '/start/plan',
    ]) {
      expect(htmlAt(path), path).not.toContain(SCRIPT)
    }
  })

  it('is in the HTML of every page the app has except the four signed-out ones', () => {
    const routes = pagePaths(join(process.cwd(), 'app'))
    expect(routes.length).toBeGreaterThan(20)
    const loaded = routes.filter((route) => htmlAt(route).includes(SCRIPT)).sort()
    expect(loaded).toEqual(['/demo', '/login', '/signup'])
  })

  it('is mounted by the root layout through the guard, never as a bare tag', () => {
    const layout = readFileSync(join(process.cwd(), 'app/layout.tsx'), 'utf8')
    expect(layout).toContain('<InteractionScript />')
    expect(layout).not.toContain(SCRIPT)
  })

  it('tolerates a trailing slash and a missing pathname', () => {
    expect(isInteractionCaptureRoute('/demo/')).toBe(true)
    expect(isInteractionCaptureRoute(null)).toBe(false)
    expect(isInteractionCaptureRoute('/demonstration')).toBe(false)
  })
})

/**
 * The fence (security note 20-10-2026, item 2). Loading is decided per route,
 * but a companion loaded on /login keeps listening after a client-side
 * navigation into the app, so the body carries data-pulse-ignore on every route
 * that is not a capture route.
 */
describe('data-pulse-ignore on the body', () => {
  const COMPANION = readFileSync(join(process.cwd(), 'tracker/script.interactions.js'), 'utf8')
  let detach: Array<() => void> = []

  afterEach(() => {
    for (const d of detach) d()
    detach = []
    document.body.removeAttribute('data-pulse-ignore')
    delete (window as unknown as { pulse?: unknown }).pulse
  })

  it('is set on an app route, cleared on a capture route, and cleared on unmount', () => {
    mockPath = '/sites/abc-123'
    const view = render(<InteractionScript />)
    expect(document.body.hasAttribute('data-pulse-ignore')).toBe(true)

    mockPath = '/login'
    view.rerender(<InteractionScript />)
    expect(document.body.hasAttribute('data-pulse-ignore')).toBe(false)

    mockPath = '/settings/account/profile'
    view.rerender(<InteractionScript />)
    expect(document.body.hasAttribute('data-pulse-ignore')).toBe(true)

    view.unmount()
    expect(document.body.hasAttribute('data-pulse-ignore')).toBe(false)
  })

  it('stops a loaded companion recording a click in a portal on an app route', () => {
    const track = vi.fn()
    ;(window as unknown as { pulse: unknown }).pulse = { track, cleanPath: () => location.pathname }
    // Load the real companion, recording its listeners so they can be removed.
    const real = document.addEventListener.bind(document)
    const spy = vi.spyOn(document, 'addEventListener').mockImplementation(((t: string, h: never, o: never) => {
      detach.push(() => document.removeEventListener(t, h, o))
      return real(t, h, o)
    }) as typeof document.addEventListener)
    new Function(COMPANION)()
    spy.mockRestore()

    // A menu portalled into <body>, outside the rendered tree: a shell-level
    // attribute could not reach it.
    const portal = document.createElement('div')
    portal.innerHTML = '<button>Switch to Example Team</button>'
    document.body.appendChild(portal)
    detach.push(() => portal.remove())

    mockPath = '/sites/abc-123'
    const view = render(<InteractionScript />)
    portal.querySelector('button')!.click()
    expect(track).not.toHaveBeenCalled()

    // n−1: the same click on a capture route is recorded, so the silence above
    // is the fence and not a companion that records nothing.
    mockPath = '/login'
    view.rerender(<InteractionScript />)
    portal.querySelector('button')!.click()
    expect(track).toHaveBeenCalledWith('pulse_click', expect.objectContaining({ text: 'Switch to Example Team' }))
    view.unmount()
  })
})
