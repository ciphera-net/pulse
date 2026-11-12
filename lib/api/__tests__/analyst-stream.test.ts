// Analyst's streamed answers (PUL-78, round 6, live answers): the event-stream reader, fed in chunks that cut events,
// lines and the CRLF pair apart, and askAnalystStream's typed events, including a server that answers with the whole
// turn at once. Round 8: the turn `start` names, and reading it back once it is kept.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const apiRequest = vi.hoisted(() => vi.fn())
const apiRequestStream = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  default: apiRequest,
  apiRequestStream,
}))

import { ApiError } from '@/lib/api/client'
import { askAnalystStream, getAnalystTurn, readServerEvents, type AnalystAnswer } from '../analyst'

/** A body that delivers the given chunks one read at a time. */
function body(...chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder()
  return new ReadableStream({
    pull(controller) {
      const next = chunks.shift()
      if (next === undefined) controller.close()
      else controller.enqueue(enc.encode(next))
    },
  })
}

async function all<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const out: T[] = []
  for await (const x of gen) out.push(x)
  return out
}

const answer: AnalystAnswer = {
  conversation_id: 'c1',
  saved: true,
  usage: { used: 4, limit: 500, resets_at: '2026-12-01T00:00:00Z' },
  turn: { id: 't1', conversation_id: 'c1', site_id: 's1', question: 'q', answer: 'Up.', outcome: 'answered', steps: [], created_at: '2026-11-11T00:00:00Z' },
}

beforeEach(() => {
  apiRequest.mockReset()
  apiRequestStream.mockReset()
})

describe('readServerEvents', () => {
  it('reads events whatever the chunks cut apart: a name, a line, the blank line, a CRLF pair', async () => {
    const events = await all(
      readServerEvents(
        body(
          'event: st',
          'art\ndata: {"conversation_id":"c1"}\n',
          '\n: a comment\n\nevent: text\r',
          '\ndata: {"delta":"Visitors"}\r\n\r\n',
          'event: done\ndata: {"a":1}\n\n',
        ),
      ),
    )
    expect(events).toEqual([
      { event: 'start', data: '{"conversation_id":"c1"}' },
      { event: 'text', data: '{"delta":"Visitors"}' },
      { event: 'done', data: '{"a":1}' },
    ])
  })

  it('joins an event spread over several data lines, and drops one left unfinished at the end', async () => {
    const events = await all(readServerEvents(body('data: first\ndata: second\n\n', 'event: text\ndata: {"delta":"cut"}\n')))
    expect(events).toEqual([{ event: 'message', data: 'first\nsecond' }])
  })
})

describe('askAnalystStream', () => {
  it('turns each event into its typed form, in order, and stops at done', async () => {
    apiRequestStream.mockResolvedValue(
      new Response(
        body(
          'event: start\ndata: {"conversation_id":"c1","turn_id":"t1"}\n\n',
          'event: step\ndata: {"index":0,"tool":"compare_periods","args":{"period":"7d"}}\n\n',
          'event: step_done\ndata: {"index":0,"ms":210,"error":"","result":{"visitors":56}}\n\n',
          'event: text\ndata: {"delta":"Visitors"}\n\n',
          'event: discard\ndata: {}\n\n',
          `event: done\ndata: ${JSON.stringify(answer)}\n\n`,
          'event: text\ndata: {"delta":"after the end"}\n\n',
        ),
        { headers: { 'content-type': 'text/event-stream' } },
      ),
    )
    const events = await all(askAnalystStream('s1', 'Why?', null))
    expect(events).toEqual([
      { type: 'start', conversation_id: 'c1', turn_id: 't1' },
      { type: 'step', index: 0, tool: 'compare_periods', args: { period: '7d' } },
      { type: 'step_done', index: 0, ms: 210, error: '', result: { visitors: 56 } },
      { type: 'text', delta: 'Visitors' },
      { type: 'discard' },
      { type: 'done', answer },
    ])
    const [path, init] = apiRequestStream.mock.calls[0]
    expect(path).toBe('/sites/s1/barry/questions')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ question: 'Why?' })
  })

  it('sends a follow-up with its conversation, and hands on a failure as an error event', async () => {
    apiRequestStream.mockResolvedValue(
      new Response(
        body(
          'event: start\ndata: {"conversation_id":"c1"}\n\n',
          'event: error\ndata: {"error":"Analyst could not answer this time, so the question was not counted.","conversation_id":"c1","usage":{"used":3,"limit":500,"resets_at":"2026-12-01T00:00:00Z"}}\n\n',
        ),
        { headers: { 'content-type': 'text/event-stream' } },
      ),
    )
    const events = await all(askAnalystStream('s1', 'And last month?', 'c1'))
    expect(JSON.parse(apiRequestStream.mock.calls[0][1].body)).toEqual({ question: 'And last month?', conversation_id: 'c1' })
    // * A server that names no turn: a break then keeps the error it always had.
    expect(events[0]).toEqual({ type: 'start', conversation_id: 'c1', turn_id: null })
    expect(events[1]).toEqual({
      type: 'error',
      error: 'Analyst could not answer this time, so the question was not counted.',
      conversation_id: 'c1',
      usage: { used: 3, limit: 500, resets_at: '2026-12-01T00:00:00Z' },
    })
  })

  it('takes a whole answer from a server that does not stream', async () => {
    apiRequestStream.mockResolvedValue(new Response(JSON.stringify(answer), { headers: { 'content-type': 'application/json' } }))
    expect(await all(askAnalystStream('s1', 'Why?', null))).toEqual([{ type: 'done', answer }])
  })
})

describe('getAnalystTurn', () => {
  it('reads one turn by the id start named, null while the server has not kept it, and passes other failures on', async () => {
    apiRequest.mockResolvedValueOnce({ turn: answer.turn })
    const stop = new AbortController()
    expect(await getAnalystTurn('s1', 't1', stop.signal)).toEqual(answer.turn)
    expect(apiRequest).toHaveBeenCalledWith('/sites/s1/barry/turns/t1', { signal: stop.signal })

    apiRequest.mockRejectedValueOnce(new ApiError('Not found', 404, { error: 'This answer is not kept yet.' }))
    expect(await getAnalystTurn('s1', 't1')).toBeNull()

    apiRequest.mockRejectedValueOnce(new ApiError('Network error', 0))
    await expect(getAnalystTurn('s1', 't1')).rejects.toThrow('Network error')
  })
})
