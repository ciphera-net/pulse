import type { ThreadAssistantMessagePart } from '@assistant-ui/react'
import { ANALYST_ALLOWANCE_REACHED, type AnalystStep, type AnalystTurn, type AnalystUsage } from '@/lib/api/analyst'
import { ApiError } from '@/lib/api/client'

/**
 * What the page makes of pulse-backend's answers: a turn becomes assistant-ui message parts, and a failed question
 * becomes the sentence a person reads. Pure, so the tests can feed it the shapes the server sends.
 */

const RESET_DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' })

/** A question the server could not answer, given back to the team's allowance. */
export const COULD_NOT_ANSWER = 'Analyst could not answer this time, so the question was not counted. Try again in a moment.'

/** A question whose stream broke after it started and whose turn was not kept in time (round 8, pick 3B). */
export const CONNECTION_DROPPED = 'The connection dropped and no answer was saved. Try again in a moment.'

/** What a person reads when a question gets no answer. The server's own wording is used only for a 400. */
export function analystErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    const data = err.data ?? {}
    if (err.status === 429 && data.code === ANALYST_ALLOWANCE_REACHED) {
      const resets = (data.usage as AnalystUsage | undefined)?.resets_at
      const day = resets ? new Date(resets) : null
      return day && !Number.isNaN(day.getTime())
        ? `Your team has used all its questions for this month. They come back on ${RESET_DAY.format(day)}.`
        : 'Your team has used all its questions for this month.'
    }
    if (err.status === 429) return 'That was a lot of questions at once. Wait a moment, then ask again.'
    if (err.status === 503) return COULD_NOT_ANSWER
    if (err.status === 404) return 'Analyst is not available for this site yet.'
    if (err.status === 400 && typeof data.error === 'string') return data.error
  }
  return 'Something went wrong, so there is no answer. Try again in a moment.'
}

/** What a turn without an answer says in the answer's place. */
export const OUTCOME_TEXT: Record<string, string> = {
  limit: 'This question needed more lookups than one answer allows. Try asking about one thing at a time.',
  cut_off: 'Analyst ran out of room before it could answer. Try a narrower question.',
  error: 'Analyst could not answer this time.',
  // * A change Analyst noticed by itself (findings.ts): still being written, or one it could not write.
  pending: 'Analyst is still writing its explanation of this change. Look again in a few minutes.',
  finding_error: 'Analyst could not explain this change.',
}

/** How pulse-backend answers a lookup past the question's limit (internal/barry/loop.go, errNotRun): it never ran. */
const NOT_RUN = 'not run:'

/** A lookup the question had no room left for (round 8, pick B): it leaves the list, and one line under it counts it. */
export function skippedLookup(step: Pick<AnalystStep, 'error'> | undefined): boolean {
  return typeof step?.error === 'string' && step.error.startsWith(NOT_RUN)
}

/** Analyst's tool that keeps a memory (memories, 14-11-2026). It is no lookup, so it is never a line or a count. */
export const MEMORY_TOOL = 'save_memory'

/** What a question's save_memory step came to: offered (the person is asked first), saved, or already kept. */
export interface MemoryOutcome {
  kind: 'offered' | 'saved' | 'already_kept'
  /** The memory's words, as Analyst wrote them or as the site keeps them already. */
  memory: string
}

/** The question's memory, from its save_memory step's result; null when it kept none or the step failed. */
export function memoryOfSteps(steps: readonly (Pick<AnalystStep, 'tool' | 'result'> | undefined)[]): MemoryOutcome | null {
  for (const step of steps) {
    if (step?.tool !== MEMORY_TOOL || !step.result || typeof step.result !== 'object') continue
    const r = step.result as Record<string, unknown>
    const memory = typeof r.memory === 'string' ? r.memory.trim() : ''
    if (!memory) continue
    if (r.saved === true) return { kind: 'saved', memory }
    if (r.offered === true) return { kind: 'offered', memory }
    if (r.already_kept === true) return { kind: 'already_kept', memory }
  }
  return null
}

/** A message's memory, as turnMetadata keeps it; null when it has none. */
export function memoryOf(metadata: { readonly custom?: Record<string, unknown> } | undefined): MemoryOutcome | null {
  const m = metadata?.custom?.memory as Partial<MemoryOutcome> | null | undefined
  if (!m || typeof m.memory !== 'string' || !['offered', 'saved', 'already_kept'].includes(String(m.kind))) return null
  return { kind: m.kind as MemoryOutcome['kind'], memory: m.memory }
}

/** A message's lookups as the line under them counts them: those skipped at the limit, and those that ran. */
export function lookupCounts(
  steps: readonly (Pick<AnalystStep, 'error' | 'tool'> | undefined)[],
): { skippedLookups: number; lookupsRan: number } {
  const lookups = steps.filter((s) => s?.tool !== MEMORY_TOOL)
  const skipped = lookups.filter((s) => skippedLookup(s)).length
  return { skippedLookups: skipped, lookupsRan: lookups.filter((s) => s !== undefined).length - skipped }
}

/** The line under a message's lookups when some were skipped at the limit (round 8, pick B); null when none was. */
export function skippedLine(metadata: { readonly custom?: Record<string, unknown> } | undefined): string | null {
  const skipped = metadata?.custom?.skippedLookups
  const ran = metadata?.custom?.lookupsRan
  if (typeof skipped !== 'number' || skipped <= 0 || typeof ran !== 'number') return null
  return `Analyst skipped ${skipped} more ${skipped === 1 ? 'lookup' : 'lookups'} because this question used all ${ran}.`
}

/** The turn as assistant-ui message parts: each lookup that ran as a tool call, then the answer. A memory is no lookup. */
export function turnParts(turn: AnalystTurn): ThreadAssistantMessagePart[] {
  const lookups = (turn.steps ?? []).filter((step) => !skippedLookup(step) && step.tool !== MEMORY_TOOL)
  const parts: ThreadAssistantMessagePart[] = lookups.map((step, i) => ({
    type: 'tool-call' as const,
    toolCallId: `${turn.id}-${i}`,
    toolName: step.tool,
    args: (step.args ?? {}) as Record<string, never>,
    argsText: JSON.stringify(step.args ?? {}),
    result: step,
  }))
  const text = turn.outcome === 'answered' && turn.answer ? turn.answer : (OUTCOME_TEXT[turn.outcome] ?? OUTCOME_TEXT.error)
  parts.push({ type: 'text' as const, text })
  return parts
}

const NO_FOLLOW_UPS: readonly string[] = []

/**
 * What a finished turn's message carries besides its parts: the questions written for the person to ask next (round
 * 7, "Ask next" under the newest answer), kept in the message so a reopened chat shows them as they were offered, and
 * the memory the question kept or offered (memories, 14-11-2026).
 */
export function turnMetadata(turn: AnalystTurn): {
  custom: { followUps: readonly string[]; skippedLookups: number; lookupsRan: number; memory: MemoryOutcome | null }
} {
  const followUps = Array.isArray(turn.follow_ups)
    ? turn.follow_ups.filter((q) => typeof q === 'string' && q.trim() !== '')
    : []
  return {
    custom: {
      followUps: followUps.length > 0 ? followUps : NO_FOLLOW_UPS,
      ...lookupCounts(turn.steps ?? []),
      memory: memoryOfSteps(turn.steps ?? []),
    },
  }
}

/** A message's follow-up questions, as turnMetadata keeps them; the same empty list when it has none. */
export function followUpsOf(metadata: { readonly custom?: Record<string, unknown> } | undefined): readonly string[] {
  const followUps = metadata?.custom?.followUps
  return Array.isArray(followUps) && followUps.length > 0 && followUps.every((q) => typeof q === 'string')
    ? (followUps as readonly string[])
    : NO_FOLLOW_UPS
}

/** A lookup while an answer streams: what the model asked for, and the finished step once it has answered. */
export interface LiveStep {
  tool: string
  args: Record<string, unknown>
  done?: AnalystStep
}

/**
 * The message so far while an answer streams (live answers, round 6): each lookup as a tool call, without a result
 * while it runs and with its step once it has answered, then the words written so far. The finished turn replaces
 * these parts (turnParts), so the message always ends exactly as a whole answer would.
 */
export function liveParts(steps: readonly (LiveStep | undefined)[], text: string): ThreadAssistantMessagePart[] {
  const parts: ThreadAssistantMessagePart[] = []
  steps.forEach((step, i) => {
    if (!step || skippedLookup(step.done) || step.tool === MEMORY_TOOL) return
    parts.push({
      type: 'tool-call' as const,
      toolCallId: `live-${i}`,
      toolName: step.tool,
      args: step.args as Record<string, never>,
      argsText: JSON.stringify(step.args),
      ...(step.done ? { result: step.done } : {}),
    })
  })
  if (text) parts.push({ type: 'text' as const, text })
  return parts
}
