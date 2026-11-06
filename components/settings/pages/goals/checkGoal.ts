import type { Goal } from '@/lib/api/goals'

/**
 * The form's checks, the server's own rules (pulse-backend `internal/api/goals.go`, `internal/eventname`), so a refusal
 * reads as the copy deck's words (§5.3) instead of a generic error (§5.6, finding 4). They apply to an edit as to an
 * add: the event name can change (R14).
 */
export type NameProblem = 'empty' | 'long'
export type EventProblem = 'empty' | 'characters' | 'long' | 'pageview' | 'taken'

export interface GoalProblems {
  name: NameProblem | null
  eventName: EventProblem | null
}

export const NO_PROBLEMS: GoalProblems = { name: null, eventName: null }

const NAME_MAX_BYTES = 255
const EVENT_MAX = 64
const EVENT_PATTERN = /^[A-Za-z0-9_]+$/

export function hasProblems(p: GoalProblems): boolean {
  return p.name !== null || p.eventName !== null
}

/** The event name as the server stores it: trimmed and lower-cased. */
export function storedEventName(eventName: string): string {
  return eventName.trim().toLowerCase()
}

export function checkGoal(
  draft: { name: string; eventName: string },
  goals: readonly Goal[],
  /** The goal being changed, which may keep its own event name; null while adding. */
  editingId: string | null,
): GoalProblems {
  const name = draft.name.trim()
  const event = draft.eventName.trim()
  return {
    name: !name
      ? 'empty'
      // The server measures the name in bytes (Go's len), so a name of accented letters reaches the limit sooner.
      : new TextEncoder().encode(name).length > NAME_MAX_BYTES
        ? 'long'
        : null,
    eventName: !event
      ? 'empty'
      : !EVENT_PATTERN.test(event)
        ? 'characters'
        : event.length > EVENT_MAX
          ? 'long'
          : storedEventName(event) === 'pageview'
            ? 'pageview'
            // One goal per event: UNIQUE(site_id, event_name) on the lower-cased name.
            : goals.some((g) => g.id !== editingId && g.event_name === storedEventName(event))
              ? 'taken'
              : null,
  }
}
