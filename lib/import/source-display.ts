// ─── What the UI says about each import source (M11-c, M11-d) ─────────────
//
// The settings tab and the dashboard name the tool a site's history came from,
// show its logo and say how its export is made. That copy is per source, so it
// lives beside the source's kind rather than in the components.
//
// 🔴 A SIBLING OF source-meta.ts, NOT PART OF IT, ON PURPOSE. §3.10b M11-c names
// source-meta.ts as the home for this copy, but the import worker imports
// source-meta.ts, and M11 must leave public/workers/import.js byte-identical.
// Measured 27-09-2026 against origin/staging's worker (sha256 c35697cd…, 40,237 B):
//   - the four fields added to SOURCE_META inline their strings into the worker
//     (40,359 B, new sha256);
//   - even a separate export in source-meta.ts that the worker never references
//     leaves the size alone but changes the bytes (sha256 e5a709b7…), because
//     esbuild picks its minified names from every input it reads.
// The worker never imports THIS file, so the bundle stays byte-identical, and a
// parser can never come to depend on display copy. A second reason it cannot live
// in SOURCE_META: that table is keyed by the sources this build can PARSE, while
// the UI names all six (the pull sources have no parser at all).

import { comparisonLogoUrl } from '@/lib/comparisonLogos'
import type { ImportSource } from './source-meta'

/**
 * Every tool id the server knows (pulse-backend `sourceid.All`, D6's order).
 * Wider than IMPORT_SOURCES: the dashboard names the source of ANY import, and
 * a pull source (GA4, Matomo) has no parser here at all.
 */
export const SOURCE_IDS = ['ga4', 'plausible', 'umami', 'fathom', 'simple_analytics', 'matomo'] as const
export type SourceId = (typeof SOURCE_IDS)[number]

/** The dashboard cards imported history can merge into (the `imported_cards` keys). */
export type ImportedDimension =
  | 'page'
  | 'entry_page'
  | 'exit_page'
  | 'referrer'
  | 'channel'
  | 'campaign'
  | 'country'
  | 'region'
  | 'city'
  | 'device'
  | 'browser'
  | 'os'
  | 'language'
  | 'screen_resolution'

export interface SourceDisplay {
  /** The tool's name as its makers write it. Fills every {tool} in the UI and its error copy. */
  label: string
  /**
   * The logo's slug on the CDN (`comparisonLogoUrl`, the /vs pages' own helper). Drawn in FULL
   * COLOUR, always (owner, Q-M11: "on the settings screen, use the colored logos"), never
   * with the Integrations tab's `grayscale opacity-60` idle treatment.
   */
  logoSlug: string
  /** The row's one line: how the history is brought in. */
  how: string
  /** The row's button. */
  verb: 'Upload' | 'Connect'
  /**
   * Cards this tool's export never carries, so a dashboard card for one can say why its
   * imported days are missing ("Plausible doesn't export them"). Only what the adapter
   * specs state; a dimension not listed simply gets no reason appended.
   */
  lacks: readonly ImportedDimension[]
}

export const SOURCE_DISPLAY: Readonly<Record<SourceId, SourceDisplay>> = {
  ga4: {
    label: 'Google Analytics',
    logoSlug: 'google-analytics',
    how: 'Sign in with Google and choose a property.',
    verb: 'Connect',
    // GA4 has no exit-page dimension (§3.4).
    lacks: ['exit_page'],
  },
  plausible: {
    label: 'Plausible',
    logoSlug: 'plausible',
    how: 'Upload the CSV export from Site settings, Imports and Exports.',
    verb: 'Upload',
    lacks: ['language', 'screen_resolution'],
  },
  umami: {
    label: 'Umami',
    logoSlug: 'umami',
    how: 'Upload your event export.',
    verb: 'Upload',
    lacks: [],
  },
  fathom: {
    label: 'Fathom',
    logoSlug: 'fathom',
    how: 'Upload daily Custom Export CSVs, one per report.',
    verb: 'Upload',
    // §3.12m7 M7-k: a per-day Custom Export carries none of these.
    lacks: ['entry_page', 'exit_page', 'language', 'screen_resolution'],
  },
  simple_analytics: {
    label: 'Simple Analytics',
    logoSlug: 'simple-analytics',
    how: 'Upload the raw data export.',
    verb: 'Upload',
    lacks: ['region', 'city'],
  },
  matomo: {
    label: 'Matomo',
    logoSlug: 'matomo',
    how: 'Connect with your Matomo address and a view-only token.',
    verb: 'Connect',
    lacks: [],
  },
}

export function isSourceId(value: unknown): value is SourceId {
  return typeof value === 'string' && (SOURCE_IDS as readonly string[]).includes(value)
}

/** A tool's display copy, or null for an id this build does not know (the server may be newer). */
export function sourceDisplay(id: string | null | undefined): SourceDisplay | null {
  return isSourceId(id) ? SOURCE_DISPLAY[id] : null
}

/** The tool's name for a sentence; an id this build does not know reads as "the other tool". */
export function sourceLabel(id: string | null | undefined): string {
  return sourceDisplay(id)?.label ?? 'the other tool'
}

/** The tool's full-colour logo on the CDN (already allowed by the CSP's img-src). */
export function sourceLogoUrl(id: SourceId): string {
  return comparisonLogoUrl(SOURCE_DISPLAY[id].logoSlug)
}

// ─── What the confirm screen says (M11-d) ─────────────────────────────────

/** Lines every source shares under "Not imported". */
export const NOT_IMPORTED_ANYWHERE: readonly string[] = [
  'Events and goals: coming in a later release',
  'Bounce rate and visit duration: Pulse shows only its own',
]

/**
 * W1 A (owner, Q-M11): the concrete visitors caveat for a source whose history
 * arrives as one visitor count per day. Added up over a range, a returning
 * visitor counts once per day they came.
 */
export function dailyVisitorsCaveat(tool: string): string {
  return `Visitors are ${tool}'s daily counts added up, so over a range someone who came on three days counts three times.`
}

/** What the upload flow says about an upload source's export. */
export interface UploadGuide {
  /** Where the export is made, under "Export file". */
  exportHelp: string
  /** What the dropzone asks for: "Choose the {fileNoun}". */
  fileNoun: string
  /** What merges into the dashboard, one line each. */
  imported: readonly string[]
  /** What this tool's export cannot bring, one line each (NOT_IMPORTED_ANYWHERE is added by the UI). */
  notImported: readonly string[]
  /** How this export's numbers differ from Pulse's own, beyond the kind's shared caveat. */
  worthKnowing: readonly string[]
}

/**
 * Keyed by ImportSource, so a source cannot be enabled for upload without its copy: the
 * type fails until each M6–M9 source adds an entry here in the same change.
 */
export const UPLOAD_GUIDE: Readonly<Record<ImportSource, UploadGuide>> = {
  plausible: {
    exportHelp: 'In Plausible: Site settings, Imports and Exports, Export to CSV. Plausible emails you a link to a ZIP file.',
    fileNoun: 'ZIP file',
    imported: [
      'Visitors, visits and pageviews',
      'Pages, entry and exit pages',
      'Referrers and campaigns',
      // Regions and cities are NOT here yet: the export names them by code only, and
      // they are skipped (`needs_place_names`) until M6's place-name mapper lands. The
      // skipped row says how many. M6 turns this line into "Countries, regions and cities".
      'Countries',
      'Devices, browsers and operating systems',
    ],
    notImported: ["Languages and screen sizes: Plausible doesn't export them"],
    worthKnowing: ["Visits with no referrer all show as Direct. An export can't tell Direct from Shared Link."],
  },
  simple_analytics: {
    // M9-b: the raw datapoints export with type=all, so a later events import needs no new export (D8).
    exportHelp:
      "In Simple Analytics: export your raw datapoints as a CSV with type=all, covering the whole range you want. Pulse's import guide has the exact export address.",
    fileNoun: 'CSV file',
    imported: [
      'Visitors, visits and pageviews',
      'Pages and entry pages',
      'Referrers and campaigns',
      'Countries',
      'Devices, browsers and operating systems',
      'Languages and screen sizes',
    ],
    notImported: [
      // M9-f: country only, on every plan and surface.
      'Regions and cities: Simple Analytics records countries only',
      // M9-e: every visit is one pageview, so an exit page would repeat the entry page.
      "Exit pages: Simple Analytics doesn't follow a visit past its first page",
    ],
    worthKnowing: [
      // M9-k: the stronger caveat, since the source's own daily figure isn't a within-day dedup.
      'Simple Analytics counts someone who comes from two different links on the same day twice, and imported days keep that count.',
      // M9-k: the entry-page disclosure.
      'Entry-page pageviews always equal entry-page visitors, because Simple Analytics does not track what a visitor did after landing.',
    ],
  },
}

/** What the Matomo flow says before it starts (§3.12m10 M10-c, M10-e, M10-f, M10-j). */
export const MATOMO_GUIDE = {
  urlCaption: "Your Matomo's own address, over https on the standard port.",
  /** M10-c: the one lever against an over-scoped token is the copy that asks for a narrow one. */
  tokenCaption:
    'Create a token for a user with View access to only this site. Pulse deletes its copy when the import ends.',
  imported: [
    'Visitors, visits and pageviews',
    'Pages, entry and exit pages',
    'Referrers and campaigns',
    'Countries, regions and cities',
    'Devices, browsers and operating systems',
    'Languages and screen sizes',
  ],
  worthKnowing: [
    // M10-e: archive-time truncation, which leaves no (other) row behind.
    "Matomo keeps at most 500 to 1,000 rows of a report per day by default. If your site has more distinct pages or referring sites than that in a single day, the extra rows aren't available to import, and Pulse can't tell.",
    // M10-f: the OS-row bot skip.
    "Visits Matomo recognises as bots may still be in Matomo's own totals, and Pulse can't detect or exclude them. They're left out of the device, browser and operating system breakdowns Pulse imports.",
    // M10-f: campaigns carry no underlying host.
    "Pulse can't tell whether a campaign click Matomo tracked arrived with a referrer, so it's recorded as Direct.",
  ],
  /** M10-j: the token stays valid at Matomo, and the finish and failed states say so. */
  revokeNote:
    "Pulse can't revoke this token automatically. You can delete it now in Matomo under Administration → Personal → Security → Auth tokens.",
} as const
