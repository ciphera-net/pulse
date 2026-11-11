// What the Analyst page makes of pulse-backend's answers (internal/api/barry_handlers.go): a turn becomes message
// parts, and every refusal becomes a sentence a person can act on. The reset day is a UTC instant printed as a UTC
// day, so this file also runs in the UTC+14 lane (npm run test:tz-positive).
import { describe, it, expect } from 'vitest'
import { ApiError } from '@/lib/api/client'
import type { AnalystTurn } from '@/lib/api/analyst'
import { OUTCOME_TEXT, analystErrorMessage, followUpsOf, turnMetadata, turnParts } from '../turn'

const usage = { used: 50, limit: 50, resets_at: '2026-12-01T00:00:00Z' }

describe('analystErrorMessage', () => {
  it('names the day the questions come back once the allowance is used', () => {
    const err = new ApiError('Too many requests', 429, {
      error: 'Your team has used all its Analyst questions for this month.',
      code: 'barry_allowance_reached',
      usage,
    })
    expect(analystErrorMessage(err)).toBe(
      'Your team has used all its questions for this month. They come back on 1 December.',
    )
  })

  it('still explains the allowance when the reset day is missing or unreadable', () => {
    const plain = 'Your team has used all its questions for this month.'
    expect(analystErrorMessage(new ApiError('x', 429, { code: 'barry_allowance_reached' }))).toBe(plain)
    expect(analystErrorMessage(new ApiError('x', 429, { code: 'barry_allowance_reached', usage: { resets_at: 'soon' } }))).toBe(plain)
  })

  it('reads any other 429 as asking too fast', () => {
    expect(analystErrorMessage(new ApiError('x', 429, { retryAfter: 30 }))).toBe(
      'That was a lot of questions at once. Wait a moment, then ask again.',
    )
  })

  it('says a 503 was not counted', () => {
    expect(analystErrorMessage(new ApiError('x', 503, {}))).toBe(
      'Analyst could not answer this time, so the question was not counted. Try again in a moment.',
    )
  })

  it('reads a 404 as not available (the beta is off, or the model is not set up), never as no data', () => {
    expect(analystErrorMessage(new ApiError('x', 404, {}))).toBe('Analyst is not available for this site yet.')
  })

  it("shows the server's own words for a 400, and only for a 400", () => {
    expect(analystErrorMessage(new ApiError('x', 400, { error: 'A question is 1 to 1,000 characters.' }))).toBe(
      'A question is 1 to 1,000 characters.',
    )
    const generic = 'Something went wrong, so there is no answer. Try again in a moment.'
    expect(analystErrorMessage(new ApiError('x', 400, {}))).toBe(generic)
    expect(analystErrorMessage(new ApiError('x', 500, { error: 'pq: relation does not exist' }))).toBe(generic)
    expect(analystErrorMessage(new TypeError('Failed to fetch'))).toBe(generic)
  })
})

const turn = (over: Partial<AnalystTurn>): AnalystTurn => ({
  id: 't1',
  conversation_id: 'c1',
  site_id: 's1',
  question: 'Why did visitors change this week?',
  answer: 'Visitors rose from 48 to 56, mostly from google.com.',
  outcome: 'answered',
  steps: null,
  created_at: '2026-11-10T21:00:00Z',
  ...over,
})

describe('turnParts', () => {
  it('turns every lookup into a tool call, in order, then the answer', () => {
    const steps = [
      { tool: 'compare_periods', args: { dimension: 'referrer' }, result: { rows: [] }, ms: 210 },
      { tool: 'get_breakdown', args: null, error: 'upstream timeout', ms: 30 },
    ]
    const parts = turnParts(turn({ steps }))
    expect(parts).toEqual([
      {
        type: 'tool-call',
        toolCallId: 't1-0',
        toolName: 'compare_periods',
        args: { dimension: 'referrer' },
        argsText: '{"dimension":"referrer"}',
        result: steps[0],
      },
      { type: 'tool-call', toolCallId: 't1-1', toolName: 'get_breakdown', args: {}, argsText: '{}', result: steps[1] },
      { type: 'text', text: 'Visitors rose from 48 to 56, mostly from google.com.' },
    ])
  })

  it('puts the outcome in the answer\'s place when there is no answer', () => {
    expect(turnParts(turn({ outcome: 'limit', answer: null }))).toEqual([{ type: 'text', text: OUTCOME_TEXT.limit }])
    expect(turnParts(turn({ outcome: 'cut_off', answer: null }))).toEqual([{ type: 'text', text: OUTCOME_TEXT.cut_off }])
    expect(turnParts(turn({ outcome: 'error', answer: null }))).toEqual([{ type: 'text', text: OUTCOME_TEXT.error }])
  })

  it('never shows a partial answer that came with an outcome other than answered', () => {
    expect(turnParts(turn({ outcome: 'cut_off', answer: 'Visitors rose from' }))).toEqual([
      { type: 'text', text: OUTCOME_TEXT.cut_off },
    ])
  })

  it('reads an answered turn with an empty answer, and an outcome it does not know, as an error', () => {
    expect(turnParts(turn({ answer: '' }))).toEqual([{ type: 'text', text: OUTCOME_TEXT.error }])
    expect(turnParts(turn({ outcome: 'paused' as AnalystTurn['outcome'], answer: null }))).toEqual([
      { type: 'text', text: OUTCOME_TEXT.error },
    ])
  })
})

describe('follow-up questions on a message', () => {
  const base: AnalystTurn = {
    id: 't1',
    conversation_id: 'c1',
    site_id: 's1',
    question: 'Where do visitors come from?',
    answer: 'Mostly google.com.',
    outcome: 'answered',
    steps: [],
    created_at: '2026-11-11T22:00:00Z',
  }

  it('keeps the questions written for a turn, and reads them back', () => {
    const metadata = turnMetadata({ ...base, follow_ups: ['Which pages do they read?', 'How did google.com change?'] })
    expect(followUpsOf(metadata)).toEqual(['Which pages do they read?', 'How did google.com change?'])
  })

  it('reads a turn without any, an old turn included, as none, and the same none every time', () => {
    const none = followUpsOf(turnMetadata(base))
    expect(none).toEqual([])
    expect(followUpsOf(turnMetadata({ ...base, follow_ups: null }))).toBe(none)
    expect(followUpsOf(turnMetadata({ ...base, follow_ups: ['  '] }))).toBe(none)
    expect(followUpsOf(undefined)).toBe(none)
    expect(followUpsOf({ custom: { followUps: [1, 2] } })).toBe(none)
  })
})
