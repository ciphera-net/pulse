import apiRequest from './client'
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

export async function getDataWindow(siteId: string): Promise<DataWindowResponse> {
  return apiRequest<DataWindowResponse>(`/sites/${siteId}/data-window`)
}
