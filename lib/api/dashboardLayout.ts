import apiRequest, { ApiError, type SendOptions } from './client'
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
  /** An event tile's event, as stored (`signup`, `Add to cart`); none: the one fired most. */
  event?: string
}

/**
 * The team's layout as the server answers it. `revision` names the layout a later save started from (review I3): ""
 * is the standard dashboard, null an answer that carries none (a share link, which never writes; a read that failed).
 */
export interface TeamLayout {
  /** null: the standard dashboard. */
  layout: PlacedWidget[] | null
  revision: string | null
}

type LayoutAnswer = { layout: PlacedWidget[] | null; revision?: string }
const teamLayout = (res: LayoutAnswer | undefined): TeamLayout => ({ layout: res?.layout ?? null, revision: res?.revision ?? null })

export async function getDashboardLayout(site: SiteRef): Promise<TeamLayout> {
  return teamLayout(await apiRequest<LayoutAnswer>(sitePath(site, '/dashboard-layout')))
}

/**
 * A save or a reset. `base`: the revision the arrangement started from, so a layout someone else saved meanwhile is
 * answered with 409 instead of being replaced (see `layoutConflict`); left out, the write replaces whatever is
 * stored (Keep mine, a copy onto another site). `keepalive`: the save was waiting for its Undo window and the page is
 * being left (PUL-28's device), so the request must start in this tick.
 */
export interface LayoutWrite extends SendOptions {
  base?: string
}

export async function saveDashboardLayout(siteId: string, layout: PlacedWidget[], write: LayoutWrite = {}): Promise<TeamLayout> {
  return teamLayout(await apiRequest<LayoutAnswer>(`/sites/${siteId}/dashboard-layout`, {
    method: 'PUT',
    body: JSON.stringify(write.base === undefined ? { layout } : { layout, base: write.base }),
    keepalive: write.keepalive,
  }))
}

export async function resetDashboardLayout(siteId: string, write: LayoutWrite = {}): Promise<TeamLayout> {
  const query = write.base === undefined ? '' : `?base=${encodeURIComponent(write.base)}`
  return teamLayout(await apiRequest<LayoutAnswer>(`/sites/${siteId}/dashboard-layout${query}`, { method: 'DELETE', keepalive: write.keepalive }))
}

/** A write refused because someone else saved the layout meanwhile (409 `layout_changed`): the layout stored now. */
export function layoutConflict(err: unknown): TeamLayout | null {
  if (!(err instanceof ApiError) || err.status !== 409 || err.data?.code !== 'layout_changed') return null
  const layout = Array.isArray(err.data.layout) ? (err.data.layout as PlacedWidget[]) : null
  return { layout, revision: typeof err.data.revision === 'string' ? err.data.revision : '' }
}
