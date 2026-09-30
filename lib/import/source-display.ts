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
    // Owner, 30-09-2026: the property is found from the site's domain, so there's nothing to choose.
    how: "Sign in with Google to import this site's history.",
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

/** Lines every source shares under "Not imported". W-M12-4 (owner, 28-09-2026) replaced "Events and goals: coming in a later release". */
export const NOT_IMPORTED_ANYWHERE: readonly string[] = [
  'Event properties, and the link or page each event happened on',
  'Bounce rate and visit duration: Pulse shows only its own',
]

// ─── The mapping step's words (M12, §3.12m12a, ruled 28-09-2026) ──────────

/** W-M12-4: the line "Imported" gains when the file has events to map. */
export const EVENTS_IMPORTED_LINE = 'Events, named as you choose below'

/** W-M12-1: the Events section's caption. */
export const EVENT_MAPPING_CAPTION =
  'Choose the name each event gets in Pulse, or leave it out. Names use letters, numbers and underscores.'

/** W-M12-2: under a name that is one of Pulse's built-ins, what it adds to. */
export const BUILTIN_EVENT_NOTE: Readonly<Record<'outbound_link' | 'file_download' | '404', string>> = {
  outbound_link: 'Adds to the outbound clicks Pulse measures',
  file_download: 'Adds to the file downloads Pulse measures',
  '404': 'Adds to the 404 pages Pulse measures',
}

/** W-M12-3 (option B): under a name Pulse already records (a goal's, or one seen natively). */
export const KNOWN_EVENT_NOTE = 'Pulse already records this event; the imported count is added'

/** Constraint 5, in W-M12-2's grammar: two source events mapped to one name. */
export function addsUpWithNote(others: readonly string[]): string {
  const list =
    others.length <= 1 ? (others[0] ?? '') : `${others.slice(0, -1).join(', ')} and ${others[others.length - 1]}`
  return `Adds up with ${list}`
}

/** The section's value: how many source events will be imported. */
export function eventsImportedCount(included: number, total: number): string {
  return `${included.toLocaleString('en-US')} of ${total.toLocaleString('en-US')} imported`
}

/**
 * W1 A (owner, Q-M11): the concrete visitors caveat for a source whose history
 * arrives as one visitor count per day. Added up over a range, a returning
 * visitor counts once per day they came.
 */
export function dailyVisitorsCaveat(tool: string): string {
  return `Visitors are ${possessive(tool)} daily counts added up, so over a range someone who came on three days counts three times.`
}

/**
 * A tool's name in the possessive (W-M5-19, design §3.12m5a constraint 5): a
 * bare apostrophe after a name ending in "s" ("Google Analytics'"), else "'s".
 */
export function possessive(name: string): string {
  return /s$/i.test(name) ? `${name}'` : `${name}'s`
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
      // M6 (PULSE-113, in production 28-09-2026) resolves the export's region codes and
      // city ids to the names native ingest stores.
      'Countries, regions and cities',
      'Devices, browsers and operating systems',
    ],
    notImported: ["Languages and screen sizes: Plausible doesn't export them"],
    worthKnowing: ["Visits with no referrer all show as Direct. An export can't tell Direct from Shared Link."],
  },
  umami: {
    // M8-a/M8-b: self-hosted Umami has no usable export, so the file is the output of the
    // published read-only query (PostgreSQL or MySQL), which the import guide prints.
    exportHelp:
      "Run Pulse's read-only export query against your Umami database and save the result as a CSV file. Pulse's import guide has the query for PostgreSQL and MySQL.",
    fileNoun: 'CSV file',
    imported: [
      'Visitors, visits and pageviews',
      'Pages, entry and exit pages',
      'Referrers and campaigns',
      'Countries, regions and cities',
      'Devices, browsers and operating systems',
      'Languages and screen sizes',
    ],
    notImported: [],
    worthKnowing: [
      // M8-h, the salt note in plain words (§3.12m8 §6).
      'Umami renews its anonymous visitor fingerprint once a month, so imported monthly totals are the sum of daily counts.',
      // M8-k: Umami calls an Android tablet a tablet; Pulse's own tracking calls it a phone.
      'Umami counts Android tablets as tablets, where Pulse counts them as phones, so imported and measured days split them differently.',
      // M8-o: a ClickHouse-backed Umami has no rows in the tables the query reads.
      'The query reads a PostgreSQL or MySQL Umami. An Umami that stores its events in ClickHouse gives an empty file.',
    ],
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

/**
 * What the Google Analytics flow says (PULSE-140, §3.12m5a; the owner ruled the
 * A line of every W-M5 row on 29-09-2026). GA4 is a pull source with no parser,
 * so its copy lives here beside MATOMO_GUIDE rather than in UPLOAD_GUIDE.
 */
export const GA4_GUIDE = {
  /** W-M5-1: the Connect row's second caption line. */
  connectNote: 'Google opens in a new window. Pulse only asks to read your Google Analytics.',
  /** W-M5-2: while the Google window is open. */
  waitingChip: 'Waiting for Google',
  waitingLabel: 'Google window',
  waitingCaption: 'Finish signing in to Google in the other window. If you closed it, open it again.',
  waitingButton: 'Open Google again',
  /** §3.12m5a constraint 4: the per-source chip word while the server says awaiting_property. */
  // Owner, 30-09-2026 (no picker since 29-09): the next step is Start the import.
  awaitingChip: 'Ready to start',
  /** W-M5-6: the account row's caption. */
  accountCaption: 'Pulse reads the property with this Google account.',
  /** W-M5-7. */
  hostnamesLoading: "Loading this property's hostnames…",
  imported: [
    'Visitors, visits and pageviews',
    'Pages and entry pages',
    'Referrers and campaigns',
    'Countries, regions and cities',
    'Devices, browsers and operating systems',
    'Languages and screen sizes',
  ],
  /** W-M5-14: GA4's own lines, before NOT_IMPORTED_ANYWHERE. */
  notImported: [
    "Exit pages: Google Analytics doesn't report them",
    "Visitor timezones, funnels and journeys: they can't be rebuilt from Google Analytics' reports",
  ],
  /** W-M5-12 (the in-app browser collapse, M5-g) and W-M5-13 (thresholding, M5-f), after the visitors caveat. */
  worthKnowing: [
    'In-app browsers, such as Instagram or TikTok, show as Safari or Chrome on imported days, because Google Analytics reports the browser underneath them.',
    "Google Analytics leaves out some small counts when Google signals is on. Pulse imports what Google reports and doesn't estimate the rest.",
  ],
  /** W-M5-17: the reconnect row's caption, naming the account that had access. */
  reconnectCaption: (email: string | null | undefined): string =>
    email
      ? `Sign in as ${email} again, or with another account that can read the property.`
      : // Owner, 29-09-2026 ("ship as written"): an import with no stored address (none was given at sign-in).
        'Sign in with an account that can read the property.',
  /** W-M5-18. */
  stoppedAt: (done: number, total: number): string =>
    `Stopped at part ${done.toLocaleString('en-US')} of ${total.toLocaleString('en-US')}`,
  /** The ruled quota sentence (§3.10a), its time per W-M5-15. */
  pausedUntil: (time: string): string => `Paused until ${time} so your Google Analytics stays usable.`,
} as const
