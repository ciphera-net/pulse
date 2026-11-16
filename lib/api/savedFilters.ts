import apiRequest, { ApiError } from './client'

// ---------------------------------------------------------------------------
// Saved filters (R59 and R60 of 16-11-2026): a set of the dashboard's filters saved under a name, the team's, per
// site. Every member reads them; whoever may edit the site saves and deletes them. The routes sit behind the
// `saved-filters` beta on the server (they answer as an unmounted path while it is off), so nothing here is called
// before useFeature says the beta is on.
// ---------------------------------------------------------------------------

export interface SavedFilter {
  id: string
  name: string
  /** The dashboard's own `filters` value, exactly as the address carries it (`v2:country|is|NO,device|is|mobile`). */
  filters: string
  created_at: string
}

/** The site's saved filters, the newest first. */
export async function listSavedFilters(siteId: string): Promise<SavedFilter[]> {
  const response = await apiRequest<{ saved_filters: SavedFilter[] }>(`/sites/${siteId}/saved-filters`)
  return response?.saved_filters ?? []
}

export async function createSavedFilter(siteId: string, body: { name: string; filters: string }): Promise<SavedFilter> {
  const response = await apiRequest<{ saved_filter: SavedFilter }>(`/sites/${siteId}/saved-filters`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
  return response.saved_filter
}

export async function deleteSavedFilter(siteId: string, id: string): Promise<void> {
  await apiRequest(`/sites/${siteId}/saved-filters/${id}`, { method: 'DELETE' })
}

/** Why the server refused a save, when it said: a name the site already uses, or the site's 50 already saved. */
export type SaveRefusal = 'name_taken' | 'limit_reached'

export function saveRefusal(err: unknown): SaveRefusal | null {
  if (!(err instanceof ApiError)) return null
  const code = err.data?.code ?? err.data?.error
  return code === 'name_taken' || code === 'limit_reached' ? code : null
}
