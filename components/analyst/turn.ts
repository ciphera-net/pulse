import type { ThreadAssistantMessagePart } from '@assistant-ui/react'
import { ANALYST_ALLOWANCE_REACHED, type AnalystStep, type AnalystTurn, type AnalystUsage } from '@/lib/api/analyst'
import { ApiError } from '@/lib/api/client'

/**
 * What the page makes of pulse-backend's answers: a turn becomes assistant-ui message parts, and a failed question
 * becomes the sentence a person reads. Pure, so the tests can feed it the shapes the server sends.
 */

const RESET_DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' })

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
    if (err.status === 503) return 'Analyst could not answer this time, so the question was not counted. Try again in a moment.'
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
}

/** The turn as assistant-ui message parts: each lookup as a tool call, then the answer. */
export function turnParts(turn: AnalystTurn): ThreadAssistantMessagePart[] {
  const parts: ThreadAssistantMessagePart[] = (turn.steps ?? []).map((step, i) => ({
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
 * 7, "Ask next" under the newest answer), kept in the message so a reopened chat shows them as they were offered.
 */
export function turnMetadata(turn: AnalystTurn): { custom: { followUps: readonly string[] } } {
  const followUps = Array.isArray(turn.follow_ups)
    ? turn.follow_ups.filter((q) => typeof q === 'string' && q.trim() !== '')
    : []
  return { custom: { followUps: followUps.length > 0 ? followUps : NO_FOLLOW_UPS } }
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
    if (!step) return
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
