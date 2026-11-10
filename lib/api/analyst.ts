import apiRequest from './client'

/**
 * Analyst, the AI analyst for one site (PUL-78). pulse-backend serves it under /barry (the internal name stays barry:
 * routes, tables, flags). Every route answers 404 to a team without the barry beta, and while the model is not
 * configured, so a 404 here means "not available", never "no data".
 *
 * A question is answered in one response with the whole turn: the answer and every lookup behind it. Nothing streams.
 */

/** One lookup the analyst made: a tool, its arguments, and what it returned (or why it failed). */
export interface AnalystStep {
  tool: string
  args: Record<string, unknown> | null
  result?: unknown
  error?: string
  ms: number
}

/** answered: there is an answer. limit: the lookups or the budget ran out first. cut_off: a reply hit its cap. */
export type AnalystOutcome = 'answered' | 'limit' | 'cut_off' | 'error'

export interface AnalystTurn {
  id: string
  conversation_id: string
  site_id: string
  question: string
  answer: string | null
  outcome: AnalystOutcome
  steps: AnalystStep[] | null
  created_at: string
}

/** The team's questions this month. resets_at is the first instant of next month (UTC). */
export interface AnalystUsage {
  used: number
  limit: number
  resets_at: string
}

export interface AnalystAnswer {
  conversation_id: string
  turn: AnalystTurn
  /** False when the answer was given but could not be kept in the person's history. */
  saved: boolean
  usage: AnalystUsage
}

/** The error code pulse-backend sends with a 429 once the team's monthly questions are used. */
export const ANALYST_ALLOWANCE_REACHED = 'barry_allowance_reached'

/**
 * Asks one question. A follow-up passes the conversation id the first answer returned, so the earlier turns go with it.
 */
export function askAnalyst(siteId: string, question: string, conversationId: string | null, signal?: AbortSignal) {
  return apiRequest<AnalystAnswer>(`/sites/${siteId}/barry/questions`, {
    method: 'POST',
    body: JSON.stringify(conversationId ? { question, conversation_id: conversationId } : { question }),
    signal,
  })
}

export function getAnalystUsage() {
  return apiRequest<AnalystUsage>('/barry/usage')
}
