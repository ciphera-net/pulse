// @vitest-environment node
//
// The demo cannot drift from the product (PUL-34, design §3.2 item 5).
//
// /demo and /share/<id> render the product's own page components (components/surfaces/*)
// through components/public/PublicPage, in a public read-only mode. What stops that from
// quietly stopping to be true is this file: it walks every page of the member route tree,
// app/sites/[id]/**, and requires each one to be either
//
//   - a public page, which means a route components/public/routes.ts resolves to one of the
//     scope's pages, rendered from components/surfaces/* by components/public/PublicPage; or
//   - on the PRIVATE list below, with the reason it must never be public.
//
// A member page added without either fails here, with what to do about it.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolvePublicRoute } from '@/components/public/routes'
import { SITE_PAGES, isSitePage } from '@/lib/scope/SiteScope'

const ROOT = process.cwd()
const MEMBER_TREE = join(ROOT, 'app', 'sites', '[id]')
const SURFACES = join(ROOT, 'components', 'surfaces')
const PUBLIC_PAGE = join(ROOT, 'components', 'public', 'PublicPage.tsx')

/** Member routes that are never public, each with the reason. Keyed like the routes below. */
const PRIVATE_MEMBER_ROUTES: Record<string, string> = {
  visitors: 'Visitors is one row per person: no public route names it (design D5; pulse-backend AllSharePages leaves it out).',
  'visitors/[key]': "One visitor's profile and visit trail: personal data, never public.",
  settings: 'A redirect into the member settings screens, which configure the site.',
  'funnels/new': 'Creating a funnel is a write. It redirects to the list, where the create modal lives, and public mode renders no write control.',
  'funnels/[funnelId]/edit': 'Editing a funnel is a write. It redirects to the detail page, where the edit modal lives, and public mode renders no write control.',
}

/** Every page.tsx under the member tree, as its route below app/sites/[id] ('' is the dashboard). */
function memberRoutes(dir = MEMBER_TREE, base = ''): string[] {
  const routes: string[] = []
  for (const name of readdirSync(dir).sort()) {
    if (name === '__tests__') continue
    const path = join(dir, name)
    if (statSync(path).isDirectory()) {
      routes.push(...memberRoutes(path, base ? `${base}/${name}` : name))
    } else if (name === 'page.tsx') {
      routes.push(base)
    }
  }
  return routes
}

/** The address a route has under /demo: dynamic segments filled with a sample value. */
function publicSegments(route: string): string[] {
  return route === '' ? [] : route.split('/').map((s) => (/^\[.+\]$/.test(s) ? `sample-${s.slice(1, -1)}` : s))
}

/** The routes with no public page and no reason to have none: what a new member page looks like to this test. */
function unaccounted(routes: string[], privateRoutes: Record<string, string>): string[] {
  return routes.filter((route) => {
    if (privateRoutes[route]) return false
    return resolvePublicRoute(publicSegments(route)) === null
  })
}

const routes = memberRoutes()
const sourceOf = (path: string) => readFileSync(path, 'utf8')
const surfaceNames = readdirSync(SURFACES).filter((f) => /Surface\.tsx$/.test(f)).map((f) => f.replace(/\.tsx$/, ''))

describe('the demo cannot drift from the product', () => {
  it('finds the member pages (control: the walk reads the real tree)', () => {
    expect(routes).toEqual(expect.arrayContaining(['', 'cdn', 'funnels', 'funnels/[funnelId]', 'journeys', 'pages', 'performance', 'search', 'uptime', 'visitors']))
    expect(routes.length).toBeGreaterThanOrEqual(14)
  })

  it('has a public page, or a reason not to, for every member page', () => {
    const missing = unaccounted(routes, PRIVATE_MEMBER_ROUTES)
    expect(
      missing,
      missing.map(
        (route) =>
          `app/sites/[id]/${route ? `${route}/` : ''}page.tsx has no public counterpart. ` +
          'If visitors should see it, add it to components/public/routes.ts and render its surface in components/public/PublicPage.tsx. ' +
          'If it must stay private, add it to PRIVATE_MEMBER_ROUTES in __tests__/public-parity.test.ts with the reason.',
      ).join('\n'),
    ).toEqual([])
  })

  it('fails for a member page that has neither (control: the check can come out the other way)', () => {
    expect(unaccounted([...routes, 'zz-control-page', 'zz-control-page/[id]'], PRIVATE_MEMBER_ROUTES)).toEqual(['zz-control-page', 'zz-control-page/[id]'])
  })

  it('maps each public member page to the page of the same name', () => {
    for (const route of routes.filter((r) => !PRIVATE_MEMBER_ROUTES[r])) {
      const resolved = resolvePublicRoute(publicSegments(route))
      const expected = route === '' ? 'dashboard' : route.split('/')[0]
      expect(resolved?.page, route || '(dashboard)').toBe(expected)
      expect(isSitePage(expected), route).toBe(true)
      if (route === 'funnels/[funnelId]') expect(resolved?.funnelId).toBe('sample-funnelId')
    }
  })

  it('covers every shareable page', () => {
    for (const page of SITE_PAGES) {
      const resolved = resolvePublicRoute(page === 'dashboard' ? [] : [page])
      expect(resolved?.page, page).toBe(page)
      // ...and some member page is that page.
      expect(routes.some((r) => (r === '' ? 'dashboard' : r.split('/')[0]) === page), page).toBe(true)
    }
  })

  it('serves nothing on the private list', () => {
    for (const route of Object.keys(PRIVATE_MEMBER_ROUTES)) {
      expect(resolvePublicRoute(publicSegments(route)), route).toBeNull()
    }
  })

  it('keeps the private list honest: every entry is a real member page, with a reason', () => {
    for (const [route, reason] of Object.entries(PRIVATE_MEMBER_ROUTES)) {
      expect(routes, `${route} is on the private list but is no longer a member page: remove it`).toContain(route)
      expect(reason.length, route).toBeGreaterThan(20)
    }
  })

  it('renders a component from components/surfaces on every public member page', () => {
    for (const route of routes.filter((r) => !PRIVATE_MEMBER_ROUTES[r])) {
      const file = join(MEMBER_TREE, ...(route ? route.split('/') : []), 'page.tsx')
      const source = sourceOf(file)
      expect(source, `${route || '(dashboard)'}: the page body is a surface component, shared with /demo`).toMatch(
        /from '@\/components\/surfaces\/\w+Surface'/,
      )
    }
  })

  it('renders every surface in the public router, so a new one cannot be added to the product and left out of the demo', () => {
    const router = sourceOf(PUBLIC_PAGE)
    expect(surfaceNames.length).toBeGreaterThanOrEqual(9)
    for (const name of surfaceNames) {
      expect(router, `${name} is not imported by components/public/PublicPage.tsx`).toContain(`from '@/components/surfaces/${name}'`)
      // (Until the branches are combined the funnel page is rendered through a local alias, `FunnelDetail`.)
      const tags = name === 'FunnelDetailSurface' ? ['FunnelDetailSurface', 'FunnelDetail'] : [name]
      expect(router, `${name} is imported but never rendered by components/public/PublicPage.tsx`).toMatch(new RegExp(`<(${tags.join('|')})\\b`))
    }
  })
})
