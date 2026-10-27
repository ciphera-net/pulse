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
  /** The Visitors page's default-off room. */
  scope: 'Each visitor is recognised for one day at most, and only on this site.',
  /** The identity statement that ends the Visitor views caption in Settings (C1; there is no identity panel). */
  settingsStatement:
    'Pulse recognises a returning reader for one day at most, in your site’s timezone. Five minutes after the day ends, Ciphera deletes the key behind that day’s identifiers and keeps no copy of it, so Pulse cannot recompute them. The same reader on the next day is a new visitor. This is fixed, not a setting.',
  /** The Visitors page's caption tail, after "Data begins 26 Aug 2026 · " (H-A; the page has no subtitle). */
  headerCaption: 'each profile covers up to one day',
  /** The roster's heading over the list of visitors (the live heading is fixed). */
  rosterHeading: 'Readers',
  /** The roster heading's InfoTip and the glossary entry: what one of these ids is, and how long it lives. */
  identityDefinition:
    'Each visitor has an identifier for one day at most. Pulse makes it from the IP address and browser, mixed with a random key made for your site and that day. Five minutes after your site’s day ends, Ciphera deletes the key and keeps no copy of it, so Pulse cannot recompute that day’s identifiers. Two people behind one address and browser count as one visitor, and one person on two networks or browsers counts as two. The same reader on a later day gets a different identifier.',
  /** The Visitors page's empty state for a range with nobody in it. */
  emptyRangeHint: 'Visitors are listed from 26 August 2026. Try a wider range.',
  /** The visitor page's 404: a profile with no activity in the selected range (R6). */
  notFoundHint:
    'This profile has no activity in the selected range. A profile covers up to one day, so it may belong to another day. Links to month-long profiles no longer work: on 27 October 2026 they were rebuilt as one-day profiles.',
  /** The deck's "Unique visitors" InfoTip definition (A1); the glossary and dashboard.mdx copy it word for word. */
  metricDefinition:
    'Visitors, not visits, counted one day at a time in your site’s timezone: one IP address and browser counts once per day. A reader who returns on another day counts again, so visitors over a range add up each day’s unique visitors.',
  /** The muted line under the legal note beside the privacy-policy text in Settings (P-A), for sites that pasted the earlier text. */
  policyNotice:
    'This text changed when Pulse moved to one-day visitor identity. If you pasted the earlier version into your policy, replace it.',
  /** One sentence for the customer's privacy policy, from the snippet generator (B1). */
  policySentence:
    'To count visitors, Pulse makes a one-day identifier on its servers from each request’s IP address and the browser’s user-agent string, using a random key that is deleted shortly after the day ends. A visitor who returns on a later day is counted again.',
} as const
