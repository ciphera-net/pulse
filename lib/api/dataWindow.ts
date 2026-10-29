import apiRequest from './client'
import { sitePath, type SiteRef } from '@/lib/scope/site-ref'
import type { DataWindow, Surface } from '@/lib/view/view'

/**
 * GET /sites/:id/data-window — for every page, the first and last day its own read
 * path can answer for (null where a surface has no data). The view switcher greys a
 * row with no data, says "since / through" on one that runs past the data, and resolves
 * All time — all from this one answer (PULSE-20).
 */
export interface DataWindowResponse {
  surfaces: Partial<Record<Surface, DataWindow | null>>
}

export async function getDataWindow(site: SiteRef): Promise<DataWindowResponse> {
  return apiRequest<DataWindowResponse>(sitePath(site, '/data-window'))
}
