import { isSitePage, type SitePage } from '@/lib/scope/SiteScope'

/**
 * What a public URL under /demo or /share/<id> shows: the path after the base, as segments.
 *
 *   []                     the dashboard
 *   ['pages']              Pages (and 'journeys', 'funnels', 'performance', 'uptime', 'search', 'cdn')
 *   ['funnels', '<id>']    one funnel
 *
 * Everything else resolves to `null`, and a null route never renders a surface: an unknown
 * segment, `['funnels', 'new']` and any edit path (a write lives in a modal a visitor never
 * gets), and the member-only pages (visitors, settings), which no public route names.
 *
 * __tests__/public-parity.test.ts walks app/sites/[id]/** against this function: a member
 * page with no entry here, and not on that test's private list, fails CI.
 */
export interface PublicRoute {
  page: SitePage
  /** Set on a single funnel's page only. */
  funnelId?: string
}

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

export function resolvePublicRoute(segments: readonly string[]): PublicRoute | null {
  if (segments.length === 0) return { page: 'dashboard' }

  const [head, ...rest] = segments
  // The dashboard is the base path itself: there is no /demo/dashboard page.
  if (!isSitePage(head) || head === 'dashboard') return null
  if (rest.length === 0) return { page: head }

  if (head === 'funnels' && rest.length === 1) {
    const funnelId = decodeSegment(rest[0])
    // `new` is the create route: a write, never public.
    if (funnelId !== '' && funnelId !== 'new') return { page: 'funnels', funnelId }
  }
  return null
}
