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
//   - GA4's sign-in, property, hostnames and confirm (M5, below), whose routes
//     exist only while GA4_IMPORT_ENABLED is on and /sources lists `ga4`.

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
  /**
   * When a WAITING import resumes (UTC RFC 3339), set only while `status` is
   * "waiting"; with `error_code` "quota_waiting" it is GA4's quota pause (M5-f,
   * state 6). Optional: an older server does not send it.
   */
  wait_until?: string | null
  /** The Google account a GA4 import reads as, for display only (M5-b). */
  google_email?: string | null
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

// ─── Google Analytics (PULSE-140, M5; mounted only while GA4_IMPORT_ENABLED) ─

/**
 * POST …/data-imports/ga4/auth-url (M5-b): Google's consent address, opened in
 * a popup. `importId` reconnects that import (a new Google account, or a grant
 * Google stopped accepting) instead of creating one. Refusals: 409
 * `import_exists` (with `import_id`), 404, 409 `import_not_active`, 503
 * `not_configured`.
 */
export function getGA4AuthURL(siteId: string, importId?: string): Promise<{ url: string }> {
  return apiRequest<{ url: string }>(`/sites/${siteId}/data-imports/ga4/auth-url`, {
    method: 'POST',
    body: JSON.stringify(importId ? { import_id: importId } : {}),
  })
}

/**
 * The property the SERVER resolved for the site (owner ruling 29-09-2026: no
 * picker). `stream_ids` are the web streams `confirm` must name.
 *
 * ⚠️ `stream_ids` is NOT in pulse-backend's answer as of `e3a2cf14` (it sends
 * `{property_id, name, stream_host}` only), yet `confirm` requires them and no
 * other route returns them. The flow never invents one: without them Start
 * stays disabled. Typed optional so the day the server sends them, it works.
 */
export interface GA4Property {
  property_id: string
  name: string
  stream_host: string
  stream_ids?: string[]
}

/**
 * POST …/:importId/ga4/property `{}`: the resolved property, or 422
 * `no_matching_property` / `several_matching_properties` with `detail` naming
 * the web-stream hosts found. Nothing is stored; the import stays awaiting_property.
 */
export function resolveGA4Property(siteId: string, importId: string): Promise<GA4Property> {
  return apiRequest<GA4Property>(`/sites/${siteId}/data-imports/${encodeURIComponent(importId)}/ga4/property`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

/** One hostname the property measured over the plan's range; `suggested` is kept by default (M5-d). */
export interface GA4Hostname {
  host: string
  pageviews: number
  /** Share of the property's pageviews, 0 to 1. */
  share: number
  suggested: boolean
}

/** POST …/:importId/ga4/hostnames `{property_id}` (M5-d). Confirm's guards and errors; nothing stored. */
export function getGA4Hostnames(
  siteId: string,
  importId: string,
  propertyId: string,
): Promise<{ hostnames: GA4Hostname[]; total_pageviews: number }> {
  return apiRequest(`/sites/${siteId}/data-imports/${encodeURIComponent(importId)}/ga4/hostnames`, {
    method: 'POST',
    body: JSON.stringify({ property_id: propertyId }),
  })
}

/** GA4's confirm body: the property, its web streams, the hostnames kept, and (M12) the event map. */
export interface GA4Confirm {
  property_id: string
  stream_ids: string[]
  hostnames: string[]
  event_map?: Record<string, string | null>
}

/**
 * POST …/:importId/confirm for GA4 (M5-d): the answer is the import, `pending`.
 * Refusals the flow names: property_mismatch, stream_not_found,
 * invalid_selection, report_incompatible (detail names the field),
 * no_data_in_range, reconnect_required, user_metrics_disabled,
 * source_unavailable, and 503 quota_waiting with `wait_until`.
 */
export function confirmGA4Import(siteId: string, importId: string, body: GA4Confirm): Promise<SiteImportStatus> {
  return apiRequest<SiteImportStatus>(`/sites/${siteId}/data-imports/${encodeURIComponent(importId)}/confirm`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}
