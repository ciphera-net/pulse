'use client'
// What a widget of a page shows when that page is not set up for the site, and how the gallery says so.
//   * In the widget: the tile keeps its sentence ("Search Console is not connected.") and gains ONE action at its foot,
//     drawn as the dashboard's chrome button, naming the step ("Connect Search Console"). The whole tile is already a
//     link to the page where that step is taken, so the action is part of that link, never a second control.
//   * In the gallery: the widget's row says "Not set up", and its preview says what the site needs first. It can
//     still be added.
import type { ReactNode } from 'react'
import { Gauge } from '@phosphor-icons/react'
import { CloudUploadIcon, FunnelIcon, HeartbeatIcon, SearchIcon } from '@ciphera-net/facet'
import { EmptyState } from '@/components/ui/EmptyState'
import { FRAME_SURFACE } from '@/lib/dashboard/frame'
import { memberScope, scopeHref, useOptionalSiteScope, type SitePage } from '@/lib/scope/SiteScope'
import { useBunnyStatus, useFunnels, useGSCStatus, usePerformanceConfig, useUptimeStatus } from '@/lib/swr/dashboard'

export const SETUP: Record<string, { page: SitePage; icon: ReactNode; title: string; line: string; action: string; needs: string }> = {
  search: { page: 'search', icon: <SearchIcon />, title: 'No Search Console yet', line: 'Connect it to see the clicks Google sends this site.', action: 'Connect Search Console', needs: 'This site has not connected Search Console yet. The widget shows how to connect it.' },
  uptime: { page: 'uptime', icon: <HeartbeatIcon />, title: 'No monitor yet', line: 'Add one to know the moment this site goes down.', action: 'Add a monitor', needs: 'This site has no uptime monitor yet. The widget shows how to add one.' },
  cdn: { page: 'cdn', icon: <CloudUploadIcon />, title: 'No CDN yet', line: 'Connect Bunny to see what its edge serves for this site.', action: 'Connect Bunny', needs: 'This site has not connected Bunny yet. The widget shows how to connect it.' },
  funnels: { page: 'funnels', icon: <FunnelIcon />, title: 'No funnels yet', line: 'A funnel shows how many visitors get from one step to the next.', action: 'Create a funnel', needs: 'This site has no funnel yet. The widget shows how to create one.' },
  performance: { page: 'performance', icon: <Gauge />, title: 'Performance checks are off', line: "Turn them on to score this site's speed on a phone and a computer.", action: 'Turn on checks', needs: 'Performance checks are off for this site. The widget shows how to turn them on.' },
}

/** True when the widget's page is not set up, false when it is, null while that is not known yet. */
function useGsc(siteId: string) { const { data } = useGSCStatus(siteId); return data ? !data.connected : null }
function useBunny(siteId: string) { const { data } = useBunnyStatus(siteId); return data ? !data.connected : null }
// The same call as the Uptime tile's (OverviewTiles), so the two share one read.
function useUptime(siteId: string, range?: Range) { const { data } = useUptimeStatus(siteId, range?.start, range?.end, range?.period === 'all' ? 'all' : undefined); return data ? data.total_monitors === 0 || !data.monitors?.length : null }
function usePerf(siteId: string) { const { data } = usePerformanceConfig(siteId); return data ? !data.enabled : null }
function useFun(siteId: string) { const { data } = useFunnels(siteId); return data ? data.length === 0 : null }
type Range = { start: string; end: string; period?: string }
const HOOKS: Record<string, (siteId: string, range?: Range) => boolean | null> = { search: useGsc, cdn: useBunny, uptime: useUptime, performance: usePerf, funnels: useFun }

/** Renders `children(unset)` for a widget that has a setup step; nothing for one that has none. */
export function SetupState({ id, siteId, range, children }: { id: string; siteId: string; range?: Range; children: (unset: boolean) => React.ReactNode }) {
  const hook = HOOKS[id]
  if (!hook) return <>{children(false)}</>
  return <SetupProbe hook={hook} siteId={siteId} range={range}>{children}</SetupProbe>
}
function SetupProbe({ hook, siteId, range, children }: { hook: (siteId: string, range?: Range) => boolean | null; siteId: string; range?: Range; children: (unset: boolean) => React.ReactNode }) {
  const unset = hook(siteId, range)
  // Not known yet: the widget as it is (it draws its own loading state).
  return <>{children(unset === true)}</>
}

/**
 * The widget of a page the site has not set up: the ONE empty state Pulse has (ruling R57, components/ui/EmptyState:
 * the orange icon, a title, one line, the chrome action), as the Funnels and Journeys block draws "No funnels yet",
 * over the tile's own glass and fitted to a tile's height.
 */
export function SetupAction({ id, siteId }: { id: string; siteId: string }) {
  const setup = SETUP[id]
  const scope = useOptionalSiteScope() ?? memberScope(siteId)
  if (!setup) return null
  return (
    <div className={`${FRAME_SURFACE} h-full overflow-hidden`} data-setup-action={id}>
      <EmptyState icon={setup.icon} title={setup.title} description={setup.line} action={{ label: setup.action, href: scopeHref(scope, setup.page) }} className="h-full gap-1.5 py-4" />
    </div>
  )
}
