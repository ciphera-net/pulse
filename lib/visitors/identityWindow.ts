// ─── The visitor-identity window ────────────────────────────────────
//
// Design: Pulse/docs/plans/11-09-2026-configurable-identity-window-design.md.
//
// How long a returning reader keeps ONE visitor_id on a site. The value is a
// column on `sites` (migration 182), CHECK-bound to exactly these five keys:
//
//   -1  session only    — no visitor_id is written at all, so "visitors" on that
//                         site degrades to the per-day session dedup every
//                         pre-26-08 row already has (design §4.3)
//    0  calendar month  — the default and today's behaviour: the identity lives
//                         until the 1st, in the site's own timezone
//    1 · 7 · 30         — an aligned rolling bucket of that many site-local days
//
// 🔴 0 AND 30 ARE DIFFERENT KEYS. §3 of the design measured them as alike — a
// 30-day bucket averages 13–19 days of life against the month's 14–23, both
// with a minimum of ONE day — but the salt each derives is a different string,
// so saving 30 on a site that sits on 0 re-mints every identity on it. That is
// why the menu never preselects 30 for an unset site, and why an unset site
// reads "Calendar month (current)" instead: the Data Retention device, where a
// stored value outside the option list is pushed in as "… (current)" and gone
// the moment a real option is chosen.
//
// ⚠️ NO WINDOW IS EXACT. A reader first seen near the end of a bucket is
// recognised for less than the window — exactly as a reader first seen on the
// 30th is recognised for one day today. Every sentence below therefore says
// "up to", never "for N days" as if it were a promise.
//
// 🔑 ONE registry of sentences, composed by every surface that shows a
// "visitors" number or explains one: Settings → Privacy, the Visitors page, the
// deck's InfoTip, the privacy-policy snippet. A site on `Session only` has
// changed what "visitors" MEANS on it, and that must be said where the number
// is shown, not only where it is configured. A second wording anywhere else is
// the drift this file exists to prevent.

/** The stored value set — mirrors migration 182's CHECK constraint. */
export type IdentityWindowDays = -1 | 0 | 1 | 7 | 30

export const IDENTITY_WINDOW_SESSION_ONLY = -1 as const
export const IDENTITY_WINDOW_CALENDAR_MONTH = 0 as const

/**
 * The four menu entries, in the owner's order (10-09-2026). The default `0` is
 * deliberately NOT one of them — see the header. Labels are English, not code.
 */
export const IDENTITY_WINDOW_OPTIONS: ReadonlyArray<{ value: IdentityWindowDays; label: string }> = [
  { value: -1, label: 'Session only' },
  { value: 1, label: '24 hours' },
  { value: 7, label: '7 days' },
  { value: 30, label: '30 days' },
]

export function isIdentityWindowDays(v: unknown): v is IdentityWindowDays {
  return v === -1 || v === 0 || v === 1 || v === 7 || v === 30
}

/**
 * The window a site payload carries, normalised.
 *
 * `undefined` stays undefined. It means "unknown" — a payload that predates the
 * field, or the public share payload, which does not carry it — never "the
 * default". A surface that cannot know the window must say something that is
 * true of every window rather than assert the month.
 */
export function identityWindowOf(
  site: { identity_window_days?: number | null } | null | undefined,
): IdentityWindowDays | undefined {
  const v = site?.identity_window_days
  if (v == null) return undefined
  return isIdentityWindowDays(v) ? v : undefined
}

/** The menu label for a stored value; `0` reads "Calendar month". */
export function identityWindowLabel(days: IdentityWindowDays): string {
  if (days === 0) return 'Calendar month'
  return IDENTITY_WINDOW_OPTIONS.find((o) => o.value === days)!.label
}

/**
 * The consequence of saving a different window. Shown in the panel footer the
 * moment the Select differs from the SAVED value (decision E2, 11-09-2026) —
 * quiet until then, because a warning that is always on is wallpaper.
 *
 * It does not promise a boundary marker on the Visitors page: that read-side
 * marker (design §9.6, item 3) is not built, and a sentence about it would be
 * describing something that does not exist.
 */
export const IDENTITY_WINDOW_CHANGE_WARNING =
  'Saving this re-mints every identity from now on. Readers recognised under the old window will be counted as new people, and the change cannot be applied backwards.'

export interface IdentityWindowCopy {
  /**
   * "Identities are pseudonymous, scoped to this site, and …" — the Visitor
   * views caption in Settings, and the default-off room on the Visitors page.
   */
  scope: string
  /** The Visitors page's one-line subtitle under its heading. */
  headline: string
  /** The roster's heading over the list of readers (the live heading is fixed). */
  rosterHeading: string
  /** The roster heading's InfoTip: what one of these pseudonyms is, and how long it lives. */
  identityDefinition: string
  /** The Visitors page's small caption tail, after "Data begins 26 Aug 2026 · ". */
  resetCaption: string
  /** The Visitors page's empty state for a range with nobody in it. */
  emptyRangeHint: string
  /** The visitor page's 404 — an identity with nothing visible in the range. */
  notFoundHint: string
  /** The Settings panel footer while nothing is pending: what the site does today. */
  quietFooter: string
  /** The deck's "Unique visitors" InfoTip definition. */
  metricDefinition: string
  /** One sentence for the customer's privacy policy, from the snippet generator. */
  policySentence: string
}

/**
 * Every sentence the product says about a site's identity window, from the one
 * value. Written once here so the surfaces cannot disagree; tested once in
 * lib/visitors/__tests__/identityWindow.test.ts, including the rule that no
 * sentence anywhere claims a window is exact.
 */
export function describeIdentityWindow(days: IdentityWindowDays | undefined): IdentityWindowCopy {
  if (days === undefined) {
    // Unknown — say only what is true of every window.
    return {
      scope: 'Identities are pseudonymous, scoped to this site, and short-lived by design.',
      headline: 'Every reader is a short-lived pseudonym — then the slate wipes clean',
      rosterHeading: 'Readers in this range',
      identityDefinition:
        'A pseudonym derived server-side from a short-lived key, scoped to this site. It cannot be linked to another site, and the key is re-minted on the site’s identity window — the calendar month unless its owner chose a shorter one — so a returning reader eventually becomes a new visitor. There is no cookie.',
      resetCaption: 'identities are short-lived by design',
      emptyRangeHint: 'Identities begin on 26 August 2026 and are short-lived by design. Try a wider range.',
      notFoundHint:
        'This identity has no visible activity in the selected range. It may belong to an earlier identity window.',
      quietFooter: 'Changing this is recorded in your audit trail.',
      metricDefinition:
        "People, not visits: a returning reader counts once within the site’s identity window — the calendar month unless its owner chose a shorter one — so a range that spans a boundary counts a returning reader once per window. Before 26 Aug 2026, deduplication was per day.",
      policySentence:
        'Visitors are counted using a short-lived, server-derived identifier that changes on a fixed schedule.',
    }
  }

  if (days === IDENTITY_WINDOW_SESSION_ONLY) {
    return {
      scope:
        'Identities are pseudonymous, scoped to this site, and last a single day — a returning reader is never recognised on a later visit.',
      headline: 'Every reader is a one-day pseudonym — a returning reader is never recognised',
      rosterHeading: 'Readers, one day at a time',
      identityDefinition:
        'A pseudonym derived server-side from a daily key, scoped to this site. It cannot be linked to another site or to the same reader tomorrow — on this site no identity outlives the day it was minted in your site’s timezone, so a returning reader is never recognised. There is no cookie.',
      resetCaption: 'a reader is counted once per day and never recognised again',
      emptyRangeHint:
        'Identities begin on 26 August 2026 and last a single day on this site. Try a wider range.',
      notFoundHint:
        'This identity has no visible activity in the selected range. It may belong to a different day — on this site a reader is never recognised on a later visit.',
      quietFooter:
        'Today a reader is counted once per day and never recognised on a later visit. Changing this is recorded in your audit trail.',
      metricDefinition:
        'People, not visits — but on this site a returning reader is never recognised: identity lasts a single day in your site’s timezone, so a reader who comes back tomorrow counts again. Before 26 Aug 2026, deduplication was per day everywhere.',
      policySentence:
        'Visitors are counted using a short-lived, server-derived identifier that changes every day, so a returning visitor is never recognised on a later day.',
    }
  }

  if (days === IDENTITY_WINDOW_CALENDAR_MONTH) {
    return {
      scope: 'Identities are pseudonymous, scoped to this site, and reset every calendar month.',
      headline: 'Every reader is a month-long pseudonym — then the slate wipes clean',
      rosterHeading: 'This month’s readers',
      identityDefinition:
        'A pseudonym derived server-side from a monthly key, scoped to this site. It cannot be linked to another site or to the same reader next month — the key is re-minted at the start of each calendar month in your site’s timezone, so a returning reader becomes a new visitor. There is no cookie.',
      resetCaption: 'identities reset each calendar month',
      emptyRangeHint: 'Identities begin on 26 August 2026 and reset each calendar month. Try a wider range.',
      notFoundHint:
        'This identity has no visible activity in the selected range. It may belong to a different month — identities reset monthly.',
      quietFooter:
        'Today a reader is recognised for the rest of the calendar month. Changing this is recorded in your audit trail.',
      metricDefinition:
        'People, not visits: a returning reader counts once. Identity is deduplicated within each calendar month in your site’s timezone, so a range that spans months counts a returning reader once per month. Before 26 Aug 2026, deduplication was per day.',
      policySentence:
        'Visitors are counted using a short-lived, server-derived identifier that is reset at the end of each calendar month.',
    }
  }

  const span = identityWindowLabel(days)
  return {
    scope: `Identities are pseudonymous, scoped to this site, and recognise a returning reader for up to ${span}.`,
    headline: `Every reader is a pseudonym for up to ${span} — then the slate wipes clean`,
    rosterHeading: 'Readers in this range',
    identityDefinition: `A pseudonym derived server-side from a key that lasts up to ${span}, scoped to this site. It cannot be linked to another site, or to the same reader once the window has passed — the key is re-minted on a rolling ${span} window in your site’s timezone, so a returning reader eventually becomes a new visitor. There is no cookie.`,
    resetCaption: `identities last up to ${span}`,
    emptyRangeHint: `Identities begin on 26 August 2026 and last up to ${span}. Try a wider range.`,
    notFoundHint: `This identity has no visible activity in the selected range. It may belong to an earlier window — identities last up to ${span}.`,
    quietFooter: `Today a reader is recognised for up to ${span}. Changing this is recorded in your audit trail.`,
    metricDefinition: `People, not visits: a returning reader counts once within a window of up to ${span} in your site’s timezone, so a range longer than that can count a returning reader more than once. Before 26 Aug 2026, deduplication was per day.`,
    policySentence: `Visitors are counted using a short-lived, server-derived identifier that is used for at most ${span}.`,
  }
}

// ─── Visitor-identity copy ───────────────────────────────────────────
//
// A visitor is one IP address and browser on one day in the site's timezone. The server
// derives the id from the IP address and the user-agent string with a random per-site, per-day
// key. Ciphera deletes the key five minutes after the site's day ends and keeps no copy of it.
// No visitor id is written. The per-site identity setting (-1/0/1/7/30) is retired:
// `identity_window_days` stays on the Site type because old rows carry it, but nothing reads or
// writes it here.
//
// Every duration is a maximum. A reader first seen at 23:50 is recognised for ten minutes, so
// sentences say "up to" or "at most".
//
// One registry of sentences, composed by every surface that shows or explains a visitors
// number. The one rule: visitors over a range add up each day's unique visitors, so no sentence
// names a date on which counting changed. The dates left are the Visitors floor (26-08-2026) and
// the not-found hint's restatement date. Imported history keeps the visitor figures its source
// reported, so a range that mixes imported and measured days mixes two ways of counting.
export const IDENTITY_COPY = {
  /** The Visitor views caption in Settings, and the Visitors page's default-off room. */
  scope: 'Each visitor is recognised for one day at most, and only on this site.',
  /** The roster's heading over the list of visitors (the live heading is fixed). */
  rosterHeading: 'Readers',
  /** The roster heading's InfoTip and the glossary entry: what one of these ids is, and how long it lives. */
  identityDefinition:
    'Each visitor has an identifier for one day at most. Pulse makes it from the IP address and browser, mixed with a random key made for your site and that day. Five minutes after your site’s day ends, Ciphera deletes the key and keeps no copy of it, so Pulse cannot recompute that day’s identifiers. Two people behind one address and browser count as one visitor, and one person on two networks or browsers counts as two. The same reader on a later day gets a different identifier.',
  /** The Visitors page's empty state for a range with nobody in it. */
  emptyRangeHint: 'Visitors are listed from 26 August 2026. Try a wider range.',
  /** The visitor page's 404: a profile with no activity in the selected range (R6). */
  notFoundHint:
    'This profile has no activity in the selected range. A profile covers up to one day, so it may belong to another day. Links to month-long profiles no longer work: on 28 October 2026 they were rebuilt as one-day profiles.',
  /** The deck's "Unique visitors" InfoTip definition (A1); the glossary and dashboard.mdx copy it word for word. */
  metricDefinition:
    'Visitors, not visits, counted one day at a time in your site’s timezone: one IP address and browser counts once per day. A reader who returns on another day counts again, so visitors over a range add up each day’s unique visitors.',
  /** One sentence for the customer's privacy policy, from the snippet generator (B1). */
  policySentence:
    'To count visitors, Pulse makes a one-day identifier on its servers from each request’s IP address and the browser’s user-agent string, using a random key that is deleted shortly after the day ends. A visitor who returns on a later day is counted again.',
} as const
