import type { LifecycleNoSitePayload, Receipt } from '@/lib/notifications/types'
import type { Rendered, Resolvers } from './index'

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
}
