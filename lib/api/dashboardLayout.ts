import apiRequest from './client'
import { sitePath, type SiteRef } from '@/lib/scope/site-ref'

// ---------------------------------------------------------------------------
// A site's dashboard layout (PUL-88, beta `dashboard-widgets`): the ordered widgets the team arranged its dashboard
// into. ONE per site, the team's, and the one its share link shows (ruling W19, 24-11-2026). `null` is the standard
// dashboard. Every member reads it; whoever may edit the site arranges and resets it. A member's routes answer as an
// unmounted path while the team is not in the beta, so nothing here is called before useFeature says it is on; the
// share link's read answers `null` instead.
// ---------------------------------------------------------------------------

/** Small (one cell), Wide (two), Large (two by two: a block), Full (the page's width, two rows), Full width (one row). */
export type WidgetSize = 's' | 'm' | 'l' | 'xl' | 'row'

export interface PlacedWidget {
  /** The widget, and for one that may be there more than once its instance (`funnels:2`). */
  id: string
  size: WidgetSize
  /** The view a compact block opens on (Referrers, Countries, …), or Key numbers' one number at Small. */
  view?: string
  /** The Funnels widget's funnel; none: the one most visitors enter. */
  funnel?: string
}

export async function getDashboardLayout(site: SiteRef): Promise<PlacedWidget[] | null> {
  const res = await apiRequest<{ layout: PlacedWidget[] | null }>(sitePath(site, '/dashboard-layout'))
  return res.layout ?? null
}

export async function saveDashboardLayout(siteId: string, layout: PlacedWidget[]): Promise<PlacedWidget[] | null> {
  const res = await apiRequest<{ layout: PlacedWidget[] | null }>(`/sites/${siteId}/dashboard-layout`, {
    method: 'PUT',
    body: JSON.stringify({ layout }),
  })
  return res.layout ?? null
}

export async function resetDashboardLayout(siteId: string): Promise<void> {
  await apiRequest(`/sites/${siteId}/dashboard-layout`, { method: 'DELETE' })
}
