/**
 * The three causes a site owner may be told their events were refused for.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * 🔴 ONE KEY SET, DECLARED ONCE.
 * ══════════════════════════════════════════════════════════════════════════
 * pulse-backend collapses its eight-reason internal drop taxonomy into exactly
 * these three strings in ONE place (`internal/ingestdrops/causes.go`) so that
 * the endpoint and the notification producer cannot disagree. This file is the
 * same discipline on this side of the wire. The surface that renders them here
 * is Settings → General, the tracking script's "Some events turned away" line
 * (the causes as phrases: "more than twice your plan's events, sent too fast"). The
 * `site_events_rejected` email words them in Iris; the in-app card that also
 * rendered them, in a clause register of its own, went with the in-app inbox
 * on 20-10-2026.
 *
 * Until 15-09-2026 the two surfaces carried two separate unions and one private
 * word map, which is the `script_features` intent-vs-deployment trap in
 * miniature: a fourth cause could have been renderable on the card and
 * invisible in the tab. Adding one is a compile error here now.
 *
 * ⚠️ These are NOT the internal reason slugs. The eight-reason vocabulary is
 * operator-only by security ruling (`quarantined` names a Cerberus outcome), and
 * the five reasons that mean Pulse is working correctly never reach a customer
 * surface at all. Never widen this union to accept one.
 */
export type IngestRejectionCause = 'plan_ceiling' | 'rate_limited' | 'outdated_script'

/** The published order — the server emits causes in it, and the tab keeps it. */
export const INGEST_REJECTION_CAUSES: readonly IngestRejectionCause[] = [
  'plan_ceiling',
  'rate_limited',
  'outdated_script',
]

/**
 * What happened to the events, in the reader's words (settings copy deck §3.3): General's line reads "Some events
 * were turned away in the last 7 days: more than twice your plan's events, sent too fast." Lower-case, because the
 * phrases follow a colon mid-sentence. (Until the settings overhaul the Monitoring tab printed noun labels, "plan
 * ceiling, rate limited, outdated script"; that tab is now part of General.)
 */
export const INGEST_CAUSE_PHRASE: Record<IngestRejectionCause, string> = {
  plan_ceiling: "more than twice your plan's events",
  rate_limited: 'sent too fast',
  outdated_script: 'sent by an old version of the script',
}


/**
 * Narrows an unknown string to a published cause.
 *
 * 🔴 The tab SKIPS what this rejects rather than printing it. The Iris
 * payload schema declares the enum, so a producer carrying an internal slug is
 * refused at produce time — this is the second line of that defence, for the
 * day a bug gets one past the first. A row that echoed whatever it was handed
 * would publish the operator taxonomy.
 */
export function isIngestRejectionCause(value: unknown): value is IngestRejectionCause {
  // ⚠️ `value in INGEST_CAUSE_PHRASE` would walk the prototype chain, so
  // 'toString' and 'constructor' narrowed TRUE and the row rendered a function
  // body where a cause should be. Own properties only. (Found by the test
  // beside this file, not by review.)
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(INGEST_CAUSE_PHRASE, value)
}

/**
 * The published causes, in published order, with anything unrecognised dropped.
 * Returns an empty array for null/undefined — never throws on a malformed body.
 */
export function knownCauses(causes: readonly unknown[] | null | undefined): IngestRejectionCause[] {
  return (causes ?? []).filter(isIngestRejectionCause)
}
