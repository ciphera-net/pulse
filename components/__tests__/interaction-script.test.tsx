import { describe, it, expect, vi } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { renderToString } from 'react-dom/server'

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
