import apiRequest, { type SendOptions } from './client'
import type { IngestRejectionCause } from '@/lib/ingest-causes'
import { sitePath, type PublicSiteRef, type SiteRef } from '@/lib/scope/site-ref'

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
  // 'keep' (PULSE-128) pins a path so it is stored verbatim, skipping both
  // shape-based and learned-parent grouping. Like 'exclude', it needs no label.
  type: 'exclude' | 'group' | 'keep'
  pattern: string
  label?: string
}

/**
 * A parent path the backend has learned holds many identifier-like children
 * (`internal/pathcardinality`, design doc §3.1) and now auto-groups under
 * `:id`. Read-only — there is no client mutation for this list itself; the
 * only client action is adding a `keep` PageRule that pins the parent back to
 * verbatim storage (design doc §3.4).
 */
export interface LearnedDynamicParent {
  /** The parent in grouped form, e.g. "/sites/:id/visitors/:id". */
  template: string
  /** When the parent was first learned. */
  learned_at: string
  /** Distinct identifier-like children observed. */
  children: number
  /** Share of this parent's children that are identifier-like (0-1). */
  share?: number
}

export interface Site {
  id: string
  /**
   * Absent from a PUBLIC read of the record (see PublicSite): the public view names no owner. Nothing
   * on the dashboard pages reads it; a member read always carries it.
   */
  user_id?: string
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
  // The sample site (PUL-34): public to everyone, synthetic data. Only the public view and the share
  // settings carry it; absent means false.
  is_demo?: boolean
  // The pages a share link serves, in the backend's spelling (dashboard, pages, journeys, funnels,
  // performance, uptime, search, cdn). A string[] on purpose: a newer backend may list a page this
  // build does not know, and that is not an error.
  share_pages?: string[]
  has_password?: boolean
  excluded_paths?: string[]
  page_rules?: PageRule[]
  auto_group_dynamic_paths?: boolean
  // Parents the backend has learned to auto-group by cardinality (PULSE-128).
  // May be missing, null, or empty on a site with nothing learned yet.
  learned_dynamic_parents?: LearnedDynamicParent[] | null
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
  // Privacy-signal toggles (PULSE-164): honour the browser's Do Not Track /
  // Global Privacy Control headers. Both default true server-side; undefined
  // here means the server hasn't sent them yet — treat as true, never false.
  respect_dnt?: boolean
  respect_gpc?: boolean
  // Referrer-domain display (PULSE-171): render a referrer row that IS a
  // hostname as that hostname instead of its brand name. DISPLAY ONLY —
  // nothing collected or stored changes. Default false server-side;
  // undefined here means "off", same as every other boolean toggle above.
  // Not audited: a dashboard display preference, not a data-handling change.
  show_referrer_domains?: boolean
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
  /** Absent from a public read, like user_id. */
  updated_at?: string
  deleted_at?: string | null
}

/**
 * The site record a PUBLIC read answers: GET /public/sites/:id (pulse-backend PublicSiteView, in
 * internal/api/public_share.go). What a page needs to draw a site (its name, domain, timezone, which data
 * it collects), and nothing that configures it: no owner, no excluded paths, page rules, password flag,
 * retention or identity window, no install status, and no `updated_at`.
 *
 * Every field below is always present on the wire; `first_event_at` and `last_event_at` are null for a
 * site that has not received an event. A PublicSite is assignable to Site (every field Site has and this
 * lacks is optional there), which is how the hooks that read the record under either scope return one
 * type: code that reads a field a public read does not carry sees `undefined`, never a made-up value.
 * Only the member record carries `has_password`, `data_retention_months`, `identity_window_days` and the
 * rest of the configuration, so a page that shows them must not render in public mode.
 */
export interface PublicSite {
  id: string
  domain: string
  display_domain: string
  name: string
  timezone: string
  is_public: boolean
  is_demo: boolean
  share_pages: string[]
  collect_page_paths: boolean
  collect_referrers: boolean
  collect_device_info: boolean
  collect_geo_data: GeoDataLevel
  collect_screen_resolution: boolean
  collect_audience_data: boolean
  hide_unknown_locations: boolean
  show_referrer_domains: boolean
  uptime_enabled: boolean
  first_event_at: string | null
  last_event_at: string | null
  created_at: string
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
 *  surface's own readers. The Monitoring tab renders the same three causes; a
 *  second union here is how the two would drift. */
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
  // Privacy-signal toggles — see the Site interface above. Omitted by any tab
  // that does not own them so it never resets the stored value.
  respect_dnt?: boolean
  respect_gpc?: boolean
  // Referrer-domain display — see the Site interface above. A POINTER on the
  // backend: omitted by any tab that does not own it so it never resets the
  // stored value.
  show_referrer_domains?: boolean
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

/**
 * The site record. A plain id is the member read (the full record); a public ref is GET /public/sites/:id,
 * which the backend serves to the demo site only (a share link reads `site` out of its dashboard
 * payload instead), and answers with the public subset.
 */
export async function getSite(site: string): Promise<Site>
export async function getSite(site: PublicSiteRef): Promise<PublicSite>
export async function getSite(site: SiteRef): Promise<Site | PublicSite>
export async function getSite(site: SiteRef): Promise<Site | PublicSite> {
  return apiRequest<Site | PublicSite>(sitePath(site))
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

export async function deleteSite(id: string, send: SendOptions = {}): Promise<{ message: string; purge_at: string }> {
  return apiRequest<{ message: string; purge_at: string }>(`/sites/${id}`, {
    method: 'DELETE',
    keepalive: send.keepalive,
  })
}

export type ResetModule = 'analytics' | 'journeys' | 'funnels' | 'uptime' | 'pagespeed' | 'cdn' | 'search_console'

export async function resetSiteData(id: string, modules: ResetModule[], send: SendOptions = {}): Promise<{ message: string; modules: string[] }> {
  return apiRequest<{ message: string; modules: string[] }>(`/sites/${id}/reset`, {
    method: 'POST',
    body: JSON.stringify({ modules }),
    keepalive: send.keepalive,
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

export async function permanentDeleteSite(id: string, send: SendOptions = {}): Promise<void> {
  await apiRequest(`/sites/${id}/permanent`, {
    method: 'DELETE',
    keepalive: send.keepalive,
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
