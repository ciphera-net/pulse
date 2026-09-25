import type { LifecycleDormantPayload, LifecycleFirstDataPayload, LifecycleNoSitePayload, Receipt } from '@/lib/notifications/types'
import type { Rendered, Resolvers } from './index'
import { formatDate } from '@/lib/utils/formatDate'

/**
 * The `lifecycle` family (iris migration 026): messages about the account as
 * a whole rather than about anything happening inside one site.
 *
 * 🔵 The copy is an OWNER RULING (09-09-2026): "it must be simple & telling the
 * fact. niet rond de pot draaien." Two rounds of longer options were rejected
 * for circling before they landed, so what is here is the fact and its
 * consequence, nothing else. Design and both rejected rounds:
 * Pulse/docs/plans/09-09-2026-lifecycle-nudge-design.md §6.
 *
 * 🔴 Nothing here may claim this is the only message. The payload's `step`
 * field exists so a second one can be added later, so that sentence would be a
 * promise the schema is designed to be able to break.
 *
 * 🔴 NO CONTAINER WORD (PULSE-59, ruled 25-09-2026). Pulse hides the workspace
 * from somebody who works alone, and a card cannot tell whether its reader is
 * alone or in a team, so the words name neither. The no-site and dormant
 * cards use the email's words (Iris render.go, ruled E1-a and E2), so the card
 * and the email say the same thing. The copy guards are the email's too: no em
 * or en dashes, no contractions, no exclamation marks, and an instant rather
 * than an age computed from now.
 *
 * The card could not name the workspace anyway: pulse-backend dropped its own
 * `organizations` table in pulse migration 019, so the producer has no name to
 * send.
 */
export const lifecycleRenderers = {
  lifecycle_no_site: (r: Receipt, _resolvers?: Resolvers): Rendered => {
    const p = r.event.payload as Partial<LifecycleNoSitePayload>
    // Step 2 is a different sentence by one word, "still": the facts have not
    // changed, only how long they have been true. A missing step reads as the
    // first message rather than guessing it is a later one.
    //
    // The "You created it N days ago" line went with PULSE-59: it anchored on
    // when the person got the workspace, which is not when they signed up for
    // somebody who later starts a second team, so no wording of it is true in
    // both cases. `days_since_created` stays in the payload, unread here.
    const still = typeof p.step === 'number' && p.step >= 2
    return {
      title: still ? 'You still have not added a site' : 'You have not added a site yet',
      body: still
        ? 'There is still no site in Pulse, so it is collecting nothing.'
        : 'There is no site in Pulse yet, so it is collecting nothing.',
      linkLabel: 'Add your first site',
    }
  },

  // iris migration 031. The counterpart to the nudge above: that one fires when
  // nothing is happening, this one when something finally did.
  //
  // 🔴 NO COUNT AND NO ELAPSED TIME. The payload carries the instant
  // sites.first_event_at was stamped, and that column is never backdated by
  // quarantine promotion — a first session held by Cerberus and released minutes
  // later leaves it matching the SECOND session (measured 19-09-2026). So "this
  // site has data" is true and "it arrived at X" is a lower bound. A card that
  // said "2 visits in the last hour" would be a number nobody can reproduce.
  //
  // The site name comes from the resolver when the card can resolve it, and from
  // the payload's optional `domain` otherwise. It is the only name this card
  // says; the event carries no workspace name and cannot.
  lifecycle_first_data: (r: Receipt, resolvers?: Resolvers): Rendered => {
    const p = r.event.payload as Partial<LifecycleFirstDataPayload>
    const name = p.site_id ? resolvers?.resolveSiteName(p.site_id) : undefined
    const site = name ?? p.domain
    return {
      title: 'Your first data has arrived',
      body: site
        ? `Pulse recorded its first visit for ${site}. Your dashboard updates as new visitors arrive.`
        : 'Pulse recorded its first visit. Your dashboard updates as new visitors arrive.',
      linkLabel: 'Open your dashboard',
    }
  },

  // iris migration 035. The only lifecycle message about an account that WORKED:
  // some site reported at some point, and none has for the qualifying window.
  //
  // 🔴 NO COMPUTED SILENCE. "Quiet for 63 days" is a different sentence every
  // day the card sits unread. The payload carries the last instant AS MEASURED
  // and the card states that date, which stays true whenever it is read.
  //
  // 🔴 AND NO SITE NAME, deliberately: this is about every site at once, which
  // is what separates it from the per-site install-silent card. Naming one would
  // invite the reader to fix that site and conclude they were done.
  lifecycle_dormant: (r: Receipt, _resolvers?: Resolvers, timeZone?: string): Rendered => {
    const p = r.event.payload as Partial<LifecycleDormantPayload>
    const at = p.last_event_at ? new Date(p.last_event_at) : null
    const on = at && !Number.isNaN(at.getTime()) ? formatDate(at, timeZone) : null
    return {
      title: 'Your sites have gone quiet',
      body: on
        ? `The last data Pulse received from your sites was on ${on}.`
        : 'None of your sites has sent data for a long time.',
      linkLabel: 'Check your sites',
    }
  },
}
