import apiRequest from './client'
import type { IngestRejectionCause } from '@/lib/ingest-causes'

export type GeoDataLevel = 'full' | 'country' | 'none'

/**
 * What a site's geographic collection level is when the client has no value for it.
 *
 * 🔴 THREE PLACES MUST HOLD THE SAME ANSWER AND ONLY ONE OF THEM IS IN THIS REPO:
 *
 *   1. this constant,
 *   2. `sites.collect_geo_data`'s column DEFAULT (pulse-backend migration 181), and
 *   3. the LITERAL in `database.CreateSite`'s INSERT — which is the one that actually
 *      decides a new site's value, because that INSERT never falls through to the
 *      column default.
 *
 * They disagreed until 10-09-2026: the client resolved an absent value to 'full' while
 * the server created every new site as 'country'. The client's answer was the more
 * permissive one, which is the wrong direction for a fallback about a privacy setting —
 * it was unreachable in practice only because the server always sends the field.
 *
 * The owner's decision that day moved the server to 'full', so all three now agree.
 * Changing any one of them without the others reintroduces exactly that disagreement,
 * silently, and a customer's geographic collection is what it disagrees about.
 * pulse-backend's `TestCreateSiteGeoDefaultMatchesTheColumnDefault` pins 2 against 3.
 */
export const DEFAULT_GEO_DATA_LEVEL: GeoDataLevel = 'full'

export interface PageRule {
  type: 'exclude' | 'group'
  pattern: string
  label?: string
}

export interface Site {
  id: string
  user_id: string
  domain: string
  /**
   * The domain rendered for a human: a site stored as "xn--mller-kva.de" reads
   * back "müller.de". Server-computed, display only — see lib/utils/displayDomain.
   * Never send this back to the API and never put it in an install snippet.
   */
  display_domain?: string
  name: string
  timezone?: string
  is_public?: boolean
  has_password?: boolean
  excluded_paths?: string[]
  page_rules?: PageRule[]
  auto_group_dynamic_paths?: boolean
  allowed_query_params?: string[]
  // Data collection settings (privacy controls)
  collect_page_paths?: boolean
  collect_referrers?: boolean
  collect_device_info?: boolean
  collect_geo_data?: GeoDataLevel
  collect_screen_resolution?: boolean
  collect_audience_data?: boolean
  // Bot and noise filtering
  filter_bots?: boolean
  // Hide unknown locations from stats
  hide_unknown_locations?: boolean
  // Data retention (months); 0 = keep forever
  data_retention_months?: number
  // Visitor-grain read surface. A DISPLAY gate, not a collection one: Pulse
  // writes the same columns either way, and this controls whether anyone can
  // read them at visitor grain. Default false; flipping it is audit-logged.
  visitor_views_enabled?: boolean
  // How long a returning reader keeps ONE visitor_id (migration 182):
  // -1 session only · 0 calendar month (the default) · 1 / 7 / 30 days.
  // Optional on the type because the PUBLIC share payload does not carry it —
  // read it through lib/visitors/identityWindow's identityWindowOf, which
  // keeps "missing" as UNKNOWN rather than quietly reading it as the default.
  identity_window_days?: number
  // Script feature toggles
  script_features?: Record<string, unknown>
  // Uptime monitoring toggle
  uptime_enabled: boolean
  is_verified?: boolean
  detected_framework?: string | null
  // Install-health telemetry (server-derived)
  first_event_at?: string | null
  last_event_at?: string | null
  install_status?: InstallStatus
  created_at: string
  updated_at: string
  deleted_at?: string | null
}

export type InstallStatus = 'never_installed' | 'active' | 'stalled'

export interface InstallStatusResponse {
  install_status: InstallStatus
  first_event_at: string | null
  last_event_at: string | null
}

/** The three causes the server may publish. Never an internal drop-reason slug:
 *  the eight-reason taxonomy is operator-only, and the endpoint collapses it to
 *  these three words (pulse-backend internal/ingestdrops/causes.go).
 *
 *  🔴 DECLARED ONCE, IN `lib/ingest-causes.ts`, and re-exported here for the API
 *  surface's own readers. The notification card renders the same three causes in
 *  a different register; a second union here is how the two would drift. */
export type { IngestRejectionCause }

export interface IngestHealthResponse {
  /** True iff at least one of the three ALARMING causes applied in the site's
   *  last 7 local days. Deliberately not "any drop": five of the eight reasons
   *  are Pulse working correctly, and a row that is always on is one people
   *  learn to skip. */
  rejected_last_7d: boolean
  /** Always an array, never null — in the published order. */
  causes: IngestRejectionCause[]
}

/** The traffic watcher's current judgement for one site — the TRAFFIC panel's
 *  one row (design 14-09-2026-traffic-watcher-design.md §5, direction T1).
 *
 *  🔴 `unwatched` IS A FIRST-CLASS ANSWER, NOT A LOADING STATE. Most sites are
 *  unwatched most of the time — production measured eight of ten on the day this
 *  shipped — and every new site is for its first five weeks. It is the honest
 *  answer for a site whose history is too short, and the panel must render it as
 *  one: `reason` says why and `watching_from` says from when.
 *
 *  🔴 `observed` and `expected` are NULLABLE and the null is load-bearing. A
 *  site that cannot be judged has no expectation; a zero here would draw
 *  "0 visitors, about 0 expected" for a brand-new site as though it had been
 *  measured. A REAL zero still arrives as 0. */
export interface TrafficStatusResponse {
  state: 'watched' | 'unwatched'
  /** Why it is unwatched. Absent when watched. */
  reason?: 'new_site' | 'timezone_changed' | 'session_boundary' | 'gap'
  /** The first day this site can be judged, YYYY-MM-DD. Absent when watched, and
   *  also absent when the reason has no knowable end date. */
  watching_from?: string
  /** The CLOSED site-local day judged, YYYY-MM-DD. Absent when unwatched. */
  day?: string
  direction?: 'steady' | 'fell' | 'rose'
  observed: number | null
  expected: number | null
  /** 🔴 The site's expectation is under the detector's floor, so it can NEVER
   *  produce a direction — whatever its traffic does.
   *
   *  "Steady" and "cannot tell" are different answers, and the panel was showing
   *  both as "Normal". Measured on production 16-09-2026: all four `Europe/*`
   *  sites are under the floor on every weekday (best 17.0 visitors, worst 1.0),
   *  so once the 26-08 session boundary clears on 30-09 they would have read
   *  "Normal" forever — claiming a judgement that was never made. */
  below_floor: boolean
}

export interface CreateSiteRequest {
  domain: string
  name: string
  timezone?: string
}

export interface UpdateSiteRequest {
  name: string
  timezone?: string
  is_public?: boolean
  password?: string
  clear_password?: boolean
  excluded_paths?: string[]
  page_rules?: PageRule[]
  auto_group_dynamic_paths?: boolean
  allowed_query_params?: string[]
  // Data collection settings (privacy controls)
  collect_page_paths?: boolean
  collect_referrers?: boolean
  collect_device_info?: boolean
  collect_geo_data?: GeoDataLevel
  collect_screen_resolution?: boolean
  collect_audience_data?: boolean
  // Bot and noise filtering
  filter_bots?: boolean
  // Script feature toggles
  script_features?: Record<string, unknown>
  // Uptime monitoring toggle
  uptime_enabled?: boolean
  // Hide unknown locations from stats
  hide_unknown_locations?: boolean
  // Data retention (months); 0 = keep forever
  data_retention_months?: number
  // Visitor-grain read surface (display gate — see the Site interface above)
  visitor_views_enabled?: boolean
  // The identity window — see the Site interface above. A POINTER on the
  // backend, so a tab that omits it merges against the stored value; only the
  // Privacy tab carries it, and it must never be sent as 0 "to be safe": 0 and
  // 30 are different keys, and any change re-mints every identity on the site.
  identity_window_days?: number
}

export async function listSites(): Promise<Site[]> {
  const response = await apiRequest<{ sites: Site[] }>('/sites')
  return response?.sites || []
}

export interface SiteOverviewDay {
  date: string
  visitors: number
}

/**
 * One site's entry in the batched GET /sites/overview — the Fleet Deck's data.
 * `today` is the resolved current date in the SITE's timezone: the server owns
 * timezone resolution, the client prints it and never computes its own range.
 * `daily` is exactly 7 site-local days (today-6 … today), zero-filled.
 * `uptime_status` is null when the site has no enabled monitor.
 */
export interface SiteOverview {
  site_id: string
  today: string
  visitors_today: number
  daily: SiteOverviewDay[]
  install_status: InstallStatus
  last_event_at: string | null
  uptime_status: 'up' | 'degraded' | 'down' | 'unknown' | null
}

export async function getSitesOverview(): Promise<SiteOverview[]> {
  const response = await apiRequest<{ sites: SiteOverview[] }>('/sites/overview')
  return response?.sites || []
}

export async function getSite(id: string): Promise<Site> {
  return apiRequest<Site>(`/sites/${id}`)
}

/**
 * The team a site belongs to, answered only to a MEMBER of that team (PULSE-87).
 * Anyone else gets the same 403 as the site itself, so it tells a non-member
 * nothing the site's own 403 does not already say.
 */
export async function getSiteTeam(id: string): Promise<{ organization_id: string }> {
  return apiRequest<{ organization_id: string }>(`/sites/${id}/team`)
}

export async function getInstallStatus(id: string): Promise<InstallStatusResponse> {
  return apiRequest<InstallStatusResponse>(`/sites/${id}/install-status`)
}

export async function getIngestHealth(id: string): Promise<IngestHealthResponse> {
  return apiRequest<IngestHealthResponse>(`/sites/${id}/ingest-health`)
}

export async function getTrafficStatus(id: string): Promise<TrafficStatusResponse> {
  return apiRequest<TrafficStatusResponse>(`/sites/${id}/traffic-status`)
}

export async function createSite(data: CreateSiteRequest): Promise<Site> {
  return apiRequest<Site>('/sites', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateSite(id: string, data: UpdateSiteRequest): Promise<Site> {
  return apiRequest<Site>(`/sites/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function deleteSite(id: string): Promise<{ message: string; purge_at: string }> {
  return apiRequest<{ message: string; purge_at: string }>(`/sites/${id}`, {
    method: 'DELETE',
  })
}

export type ResetModule = 'analytics' | 'journeys' | 'funnels' | 'uptime' | 'pagespeed' | 'cdn' | 'search_console'

export async function resetSiteData(id: string, modules: ResetModule[]): Promise<{ message: string; modules: string[] }> {
  return apiRequest<{ message: string; modules: string[] }>(`/sites/${id}/reset`, {
    method: 'POST',
    body: JSON.stringify({ modules }),
  })
}

export async function verifySite(id: string): Promise<void> {
  await apiRequest(`/sites/${id}/verify`, {
    method: 'POST',
  })
}

/**
 * Record which platform a site is installed on.
 *
 * Detection (`detectFramework`) only fingerprints what it can reach and never
 * clears a stale answer, so the customer's own pick is the authoritative one.
 * Pass an empty string to clear it back to unknown.
 */
export async function setSiteFramework(id: string, framework: string): Promise<{ detected_framework: string | null }> {
  return apiRequest<{ detected_framework: string | null }>(`/sites/${id}/framework`, {
    method: 'PUT',
    body: JSON.stringify({ framework }),
  })
}

export async function restoreSite(id: string): Promise<void> {
  await apiRequest(`/sites/${id}/restore`, {
    method: 'POST',
  })
}

export async function permanentDeleteSite(id: string): Promise<void> {
  await apiRequest(`/sites/${id}/permanent`, {
    method: 'DELETE',
  })
}

export async function listDeletedSites(): Promise<Site[]> {
  const response = await apiRequest<{ sites: Site[] }>('/sites/deleted')
  return response?.sites || []
}

export interface FrameworkDetectionResult {
  framework: string | null
  confidence?: string
  version?: string
  error?: string
}

export async function detectFramework(domain: string): Promise<FrameworkDetectionResult> {
  return apiRequest<FrameworkDetectionResult>(
    `/detect-framework?domain=${encodeURIComponent(domain)}`
  )
}
