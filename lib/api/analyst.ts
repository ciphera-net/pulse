import apiRequest, { ApiError, apiRequestStream, type SendOptions } from './client'

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
  /** The questions written for a person to ask next (round 7, "Ask next"); absent when none were written. */
  follow_ups?: string[] | null
  /**
   * True on the first turn of a chat opened from a change Analyst noticed: a copy of the finding's question and
   * answer. Its question is drawn as a heading, never as the person's question (O2).
   */
  asked_by_analyst?: boolean
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
 * One event of a streamed answer, in the order pulse-backend sends them: `start` (the conversation, and the turn's id
 * as it will be kept), then for each lookup `step` and `step_done` (with its result), the answer's `text` in pieces
 * (`discard` drops text that turned out not to be the answer), and last `done` (the same body as askAnalyst's) or
 * `error` (a failure, the question given back).
 */
export type AnalystStreamEvent =
  // * turn_id (round 8): the page reads the turn by it when the stream breaks before `done`; null from a server that
  // * does not name it, which leaves such a break to the error it always had.
  | { type: 'start'; conversation_id: string; turn_id: string | null }
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
  findingId: string | null = null,
): AsyncGenerator<AnalystStreamEvent> {
  // * A question about a change Analyst noticed names the finding instead of a conversation: the server starts the
  // * person's own chat with a copy of the finding first, and `start` names that chat for the questions after it.
  const body = conversationId
    ? { question, conversation_id: conversationId }
    : findingId
      ? { question, finding_id: findingId }
      : { question }
  const res = await apiRequestStream(`/sites/${siteId}/barry/questions`, {
    method: 'POST',
    body: JSON.stringify(body),
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
        yield {
          type: 'start',
          conversation_id: String(p.conversation_id ?? ''),
          turn_id: typeof p.turn_id === 'string' && p.turn_id !== '' ? p.turn_id : null,
        }
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

/**
 * A change Analyst's weekly watcher noticed on a site (design Pulse/docs/plans/14-11-2026-analyst-watchers-design.md
 * §12): a row of the list under the suggestions (A1). The site's team reads the same ones. `week` is the week's Monday
 * (YYYY-MM-DD, the site's calendar), `change` is (visitors - usual) / usual, and `outcome` is 'pending' until Analyst
 * has written its explanation.
 */
export interface AnalystFindingSummary {
  id: string
  week: string
  direction: 'fall' | 'rise'
  visitors: number
  usual: number
  change: number
  outcome: AnalystOutcome | 'pending'
  created_at: string
}

export interface AnalystFindings {
  findings: AnalystFindingSummary[]
  kept_days: number
}

/** One change opened (O2): the question Analyst asked itself, its answer, the lookups behind it and what to ask next. */
export interface AnalystFinding extends AnalystFindingSummary {
  site_id: string
  question: string
  answer: string | null
  steps: AnalystStep[] | null
  follow_ups?: string[] | null
}

export function getAnalystFindings(siteId: string) {
  return apiRequest<AnalystFindings>(`/sites/${siteId}/barry/findings`)
}

export function getAnalystFinding(siteId: string, findingId: string) {
  return apiRequest<{ finding: AnalystFinding }>(`/sites/${siteId}/barry/findings/${encodeURIComponent(findingId)}`)
}

/**
 * One of the person's own turns, by the id the stream's `start` named, once the server has kept it; null while it has
 * not (round 8: what the page reads when an answer's stream broke after it started).
 */
export async function getAnalystTurn(siteId: string, turnId: string, signal?: AbortSignal): Promise<AnalystTurn | null> {
  try {
    const { turn } = await apiRequest<{ turn: AnalystTurn }>(`/sites/${siteId}/barry/turns/${turnId}`, { signal })
    return turn
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null
    throw err
  }
}

/**
 * A memory: something a team told Analyst about one site, such as what a source is or when a campaign ran (memories,
 * 14-11-2026; the server's table still says notes). Analyst reads every memory with every question about the site and,
 * once someone has turned memories on, saves new ones from what people tell it. A memory belongs to the team, so the
 * server never names its author.
 */
export interface AnalystMemory {
  id: string
  site_id: string
  body: string
  created_at: string
  updated_at: string
}

/**
 * A site's memories, oldest first, with the server's limits (20 memories of up to 280 characters today) and its switch:
 * enabled is null while nobody has decided, and offer_snoozed_until is set while a Not now holds the first ask back.
 */
export interface AnalystMemories {
  memories: AnalystMemory[]
  max_memories: number
  max_length: number
  enabled: boolean | null
  offer_snoozed_until: string | null
}

/** The error code of a site that already keeps max_memories memories (409). */
export const ANALYST_MEMORIES_FULL = 'barry_memories_full'

/** Everyone with Analyst reads and changes a site's memories and its switch (owner ruling, 14-11-2026). */
export function getAnalystMemories(siteId: string) {
  return apiRequest<AnalystMemories>(`/sites/${siteId}/barry/memories`)
}

/** Rewrites a memory's text: 1 to max_length characters (400 otherwise), 404 when the memory is gone. */
export function updateAnalystMemory(siteId: string, memoryId: string, body: string) {
  return apiRequest<AnalystMemory>(`/sites/${siteId}/barry/memories/${memoryId}`, {
    method: 'PATCH',
    body: JSON.stringify({ body }),
  })
}

/** Deletes a memory (204); 404 when it is already gone. */
/** Deletes one of the person's own chats about the site, every turn in it (the Recent chats list's trash button). */
export function deleteAnalystConversation(siteId: string, conversationId: string, send: SendOptions = {}) {
  return apiRequest<{ deleted: number }>(`/sites/${siteId}/barry/conversations/${conversationId}`, { method: 'DELETE', keepalive: send.keepalive })
}

export function deleteAnalystMemory(siteId: string, memoryId: string, send: SendOptions = {}) {
  return apiRequest<void>(`/sites/${siteId}/barry/memories/${memoryId}`, { method: 'DELETE', keepalive: send.keepalive })
}

/** Turns the site's memories on or off (Site Settings, Analyst). */
export function setAnalystMemoriesEnabled(siteId: string, enabled: boolean) {
  return apiRequest<{ enabled: boolean }>(`/sites/${siteId}/barry/memories/settings`, {
    method: 'PUT',
    body: JSON.stringify({ enabled }),
  })
}

/**
 * The first ask's yes, from a chat: turns the site's memories on and keeps the memory Analyst offered. A full site
 * still turns them on and answers 409 with code barry_memories_full.
 */
export function acceptAnalystMemory(siteId: string, body: string) {
  return apiRequest<{ memory: AnalystMemory; enabled: true }>(`/sites/${siteId}/barry/memories/accept`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  })
}

/** The first ask's Not now: Analyst does not ask again on the site for 30 days (204). */
export function snoozeAnalystMemories(siteId: string) {
  return apiRequest<void>(`/sites/${siteId}/barry/memories/snooze`, { method: 'POST' })
}

/** True when a memory was refused because the site already keeps the most memories Analyst keeps. */
export function isAnalystMemoriesFull(err: unknown): boolean {
  return err instanceof ApiError && err.status === 409 && err.data?.code === ANALYST_MEMORIES_FULL
}
