'use client'

import CdnSurface from '@/components/surfaces/CdnSurface'
import DashboardSurface from '@/components/surfaces/DashboardSurface'
import FunnelDetailSurface from '@/components/surfaces/FunnelDetailSurface'
import FunnelsSurface from '@/components/surfaces/FunnelsSurface'
import JourneysSurface from '@/components/surfaces/JourneysSurface'
import PagesSurface from '@/components/surfaces/PagesSurface'
import PerformanceSurface from '@/components/surfaces/PerformanceSurface'
import SearchSurface from '@/components/surfaces/SearchSurface'
import UptimeSurface from '@/components/surfaces/UptimeSurface'
import { NotShared } from '@/components/public/states'
import { resolvePublicRoute } from '@/components/public/routes'
import { useSiteScope } from '@/lib/scope/SiteScope'

/**
 * The page a public URL shows: the one place the segments under /demo and /share/<id> become
 * one of the product's page components (components/surfaces/*), the same ones /sites/<id>
 * renders. A page the scope does not share, an unknown address and every write route
 * (`funnels/new`, an edit) resolve to the not-shared state and never reach a surface.
 *
 * Every surface is imported here by name on purpose: __tests__/public-parity.test.ts fails
 * when a component under components/surfaces is not rendered by this file, so a new surface
 * cannot be added to the product and forgotten by the demo.
 */
export default function PublicPage({ segments }: { segments: readonly string[] }) {
  const scope = useSiteScope()
  const route = resolvePublicRoute(segments)
  if (!route || !scope.pages.includes(route.page)) return <NotShared scope={scope} />

  switch (route.page) {
    case 'dashboard':
      return <DashboardSurface />
    case 'pages':
      return <PagesSurface />
    case 'journeys':
      return <JourneysSurface />
    case 'funnels':
      // Keyed by funnel: a different funnel is a different page, as it is under /sites/<id>.
      return route.funnelId ? <FunnelDetailSurface key={route.funnelId} funnelId={route.funnelId} /> : <FunnelsSurface />
    case 'performance':
      return <PerformanceSurface />
    case 'uptime':
      return <UptimeSurface />
    case 'search':
      return <SearchSurface />
    case 'cdn':
      return <CdnSurface />
    default: {
      const unreachable: never = route.page
      return unreachable
    }
  }
}
