import apiRequest from './client'
import type { ImportStatus } from '@/lib/import/types'

// ─── History-import routes the upload library does not own (PULSE-118) ─────
//
// lib/import carries the upload pipeline and its five routes (upload-window,
// create, batches, status, delete). Two more surfaces belong to the settings
// screen instead, so they live here:
//
//   - GET  …/data-imports/sources: which sources this site may import from
//     (design §3.10b M11-b). A plain 404 while DATA_IMPORT_ENABLED is off, so
//     production stays dark with no frontend flag.
//   - the Matomo connect flow, built against M10's route contract (§3.12m10
//     "Routes"). Its routes 404 until M10's backend mounts them, and the row
//     that reaches them only renders once /sources lists `matomo`.

/**
 * The status object as the server sends it for ANY import in the site's one slot
 * (M2-r's shape). lib/import types it for an upload, whose range and steps are
 * always set; a pull import (Matomo, GA4) is created `awaiting_property` with
 * neither, so the screen reads this wider type.
 */
export type SiteImportStatus = Omit<ImportStatus, 'range_start' | 'range_end' | 'steps_total' | 'source_timezone'> & {
  range_start: string | null
  range_end: string | null
  steps_total: number | null
  source_timezone: string | null
}

/** One entry of GET …/data-imports/sources. A source that is not available is absent, never `enabled: false`. */
export interface ImportSourceEntry {
  source: string
  kind: string
  enabled: boolean
}

export function getImportSources(siteId: string): Promise<{ sources: ImportSourceEntry[] }> {
  return apiRequest<{ sources: ImportSourceEntry[] }>(`/sites/${siteId}/data-imports/sources`)
}

/** One site the token can see (`SitesManager.getSitesWithAtLeastViewAccess`, M10-c). */
export interface MatomoProperty {
  id: string
  name: string
  main_url: string
  timezone: string
}

/**
 * POST …/data-imports/matomo/connect (M10-b). Connect IS the test: the answer is
 * the import in `awaiting_property`, or a named refusal (bad_url,
 * matomo_not_matomo, matomo_private_address, matomo_bad_port, matomo_bad_token,
 * no_properties, import_exists). The token travels in the body of this one
 * request and is never stored in the browser.
 */
export function connectMatomo(
  siteId: string,
  body: { base_url: string; token: string; /** Reconnect: the import whose token this replaces (M10 "Routes"). */ import_id?: string },
): Promise<SiteImportStatus> {
  return apiRequest<SiteImportStatus>(`/sites/${siteId}/data-imports/matomo/connect`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

/** GET …/data-imports/matomo/properties?import_id= (M10-c): the sites the connected token can see. */
export function getMatomoProperties(
  siteId: string,
  importId: string,
): Promise<{ properties: MatomoProperty[]; suggested_id: string | null }> {
  return apiRequest(`/sites/${siteId}/data-imports/matomo/properties?import_id=${encodeURIComponent(importId)}`)
}

/**
 * POST …/data-imports/:importId/confirm (M10-d): stores the plan for the chosen
 * site and hands the import to the worker. The answer is the import, `pending`.
 */
export function confirmDataImport(
  siteId: string,
  importId: string,
  propertyId: string,
  /**
   * M12 (contract §3.12m12b-5): the confirmed mapping step. Absent means the
   * import carries no events; `{}` is an events-capable import with none.
   */
  eventMap?: Record<string, string | null>,
): Promise<SiteImportStatus> {
  return apiRequest<SiteImportStatus>(`/sites/${siteId}/data-imports/${encodeURIComponent(importId)}/confirm`, {
    method: 'POST',
    body: JSON.stringify(eventMap ? { property_id: propertyId, event_map: eventMap } : { property_id: propertyId }),
  })
}

/**
 * POST …/data-imports/:importId/events-preview (M12, contract §3.12m12b-5): the
 * chosen Matomo site's event names over the range the plan will cover, largest
 * first, so the confirm step can map them before the worker reads a day. The
 * same guards and errors as `confirm`.
 */
export function previewDataImportEvents(
  siteId: string,
  importId: string,
  propertyId: string,
): Promise<{ events: { source_name: string; count: number }[] }> {
  return apiRequest(`/sites/${siteId}/data-imports/${encodeURIComponent(importId)}/events-preview`, {
    method: 'POST',
    body: JSON.stringify({ property_id: propertyId }),
  })
}

/** What the settings screen needs from the upload window: the site's one import slot. */
export interface ImportSlot {
  existing_import: SiteImportStatus | null
}

/**
 * The site's one import, whatever its kind, read from GET …/upload-window's
 * `existing_import` (the only route that reports the slot without an id; the
 * server's lookup is site-scoped, not source-scoped). `source` must be an upload
 * source the server lists: the route refuses any other.
 *
 * 🔑 Read here rather than through lib/import's getUploadWindow ON PURPOSE: that
 * parser was written for uploads and refuses a status with no range, which is
 * exactly what a pull import holds while it waits for its site to be chosen
 * (`awaiting_property`). The screen must be able to show that import, and to
 * poll a pull import's progress, without the upload library's parser in the way.
 */
export function getImportSlot(siteId: string, source: string): Promise<ImportSlot> {
  return apiRequest<ImportSlot>(`/sites/${siteId}/data-imports/upload-window?source=${encodeURIComponent(source)}`)
}
