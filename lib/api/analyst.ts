import apiRequest, { apiRequestStream } from './client'

/**
 * Analyst, the AI analyst for one site (PUL-78). pulse-backend serves it under /barry (the internal name stays barry:
 * routes, tables, flags). Every route answers 404 to a team without the barry beta, and while the model is not
 * configured, so a 404 here means "not available", never "no data".
 *
 * A question is answered as a stream (askAnalystStream): each lookup as it starts and ends, the answer's words as they
 * are written, then the whole turn. askAnalyst asks for the turn in one response. Each person's turns are kept for 30
 * days, grouped into conversations (the past chats under the suggestions).
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

/**
 * One event of a streamed answer, in the order pulse-backend sends them: `start` (the conversation), then for each
 * lookup `step` and `step_done` (with its result), the answer's `text` in pieces (`discard` drops text that turned out
 * not to be the answer), and last `done` (the same body as askAnalyst's) or `error` (a failure, the question given
 * back).
 */
export type AnalystStreamEvent =
  | { type: 'start'; conversation_id: string }
  | { type: 'step'; index: number; tool: string; args: Record<string, unknown> | null }
  | { type: 'step_done'; index: number; ms: number; error: string; result: unknown }
  | { type: 'text'; delta: string }
  | { type: 'discard' }
  | { type: 'done'; answer: AnalystAnswer }
  | { type: 'error'; error: string; conversation_id: string; usage?: AnalystUsage }

/** Server-sent events from a response body: blocks split by a blank line, each an `event:` and its `data:` lines. */
export async function* readServerEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<{ event: string; data: string }> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    for (;;) {
      const { value, done } = await reader.read()
      // * CRLF is legal in an event stream; a \r left at a chunk's end joins its \n on the next read.
      buffer = (buffer + decoder.decode(value, { stream: !done })).replace(/\r\n/g, '\n')
      let end: number
      while ((end = buffer.indexOf('\n\n')) >= 0) {
        const block = buffer.slice(0, end)
        buffer = buffer.slice(end + 2)
        let event = 'message'
        const data: string[] = []
        for (const line of block.split('\n')) {
          if (line === '' || line.startsWith(':')) continue
          const colon = line.indexOf(':')
          const field = colon < 0 ? line : line.slice(0, colon)
          const text = colon < 0 ? '' : line.slice(colon + 1).replace(/^ /, '')
          if (field === 'event') event = text
          else if (field === 'data') data.push(text)
        }
        if (data.length) yield { event, data: data.join('\n') }
      }
      if (done) return
    }
  } finally {
    reader.releaseLock()
  }
}

/**
 * Asks one question and hands on its answer as it comes. A follow-up passes the conversation id, as with askAnalyst.
 * A refused question (the allowance, a bad question, Analyst off) throws an ApiError before the first event; a
 * failure after it arrives as an `error` event.
 */
export async function* askAnalystStream(
  siteId: string,
  question: string,
  conversationId: string | null,
  signal?: AbortSignal,
): AsyncGenerator<AnalystStreamEvent> {
  const res = await apiRequestStream(`/sites/${siteId}/barry/questions`, {
    method: 'POST',
    body: JSON.stringify(conversationId ? { question, conversation_id: conversationId } : { question }),
    signal,
  })
  // * A server that answers with the whole turn at once (one that does not stream) still gives a done.
  if (!(res.headers.get('content-type') ?? '').startsWith('text/event-stream') || !res.body) {
    yield { type: 'done', answer: (await res.json()) as AnalystAnswer }
    return
  }
  for await (const { event, data } of readServerEvents(res.body)) {
    let p: Record<string, unknown>
    try {
      p = JSON.parse(data)
    } catch {
      continue
    }
    switch (event) {
      case 'start':
        yield { type: 'start', conversation_id: String(p.conversation_id ?? '') }
        break
      case 'step':
        yield { type: 'step', index: Number(p.index), tool: String(p.tool ?? ''), args: (p.args as Record<string, unknown> | null) ?? null }
        break
      case 'step_done':
        yield { type: 'step_done', index: Number(p.index), ms: Number(p.ms ?? 0), error: String(p.error ?? ''), result: p.result ?? null }
        break
      case 'text':
        yield { type: 'text', delta: String(p.delta ?? '') }
        break
      case 'discard':
        yield { type: 'discard' }
        break
      case 'done':
        yield { type: 'done', answer: p as unknown as AnalystAnswer }
        return
      case 'error':
        yield {
          type: 'error',
          error: String(p.error ?? ''),
          conversation_id: String(p.conversation_id ?? ''),
          usage: p.usage as AnalystUsage | undefined,
        }
        return
    }
  }
}

export function getAnalystUsage() {
  return apiRequest<AnalystUsage>('/barry/usage')
}

/** One of a person's conversations about a site: its turns oldest first. started_at is its first turn's time. */
export interface AnalystConversation {
  id: string
  started_at: string
  turns: AnalystTurn[]
}

/** A person's own conversations about one site, the most recently active first, kept for kept_days. */
export interface AnalystConversations {
  conversations: AnalystConversation[]
  kept_days: number
}

export function getAnalystConversations(siteId: string) {
  return apiRequest<AnalystConversations>(`/sites/${siteId}/barry/conversations`)
}
