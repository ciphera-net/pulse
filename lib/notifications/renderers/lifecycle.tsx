import type { LifecycleNoSitePayload, Receipt } from '@/lib/notifications/types'
import type { Rendered, Resolvers } from './index'

/**
 * The `lifecycle` family (iris migration 026): messages about the workspace
 * itself rather than about anything happening inside it.
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
 * The card cannot name the workspace, and that is a fact about the estate
 * rather than a copy choice: pulse-backend dropped its own `organizations`
 * table in pulse migration 019, so the producer has no name to send.
 */
export const lifecycleRenderers = {
  lifecycle_no_site: (r: Receipt, _resolvers?: Resolvers): Rendered => {
    const p = r.event.payload as Partial<LifecycleNoSitePayload>
    // days is only absent if a producer bypassed the payload schema. Say less
    // rather than say "0 days" — a sentence that is simply false is worse than
    // a shorter one.
    const days = typeof p.days_since_created === 'number' ? p.days_since_created : 0
    const age =
      days === 1 ? ' You created it 1 day ago.' : days > 1 ? ` You created it ${days} days ago.` : ''
    return {
      title: 'Your workspace has no site',
      body: `Pulse is collecting nothing until you add one.${age}`,
      linkLabel: 'Add your first site',
    }
  },
}
