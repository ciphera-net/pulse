// The words and the chat of a change Analyst noticed (design §12, A1 and O2): every figure is one the watcher measured,
// shown whole, and a finding opens as a chat of one turn whose question is Analyst's own.
import { describe, it, expect } from 'vitest'
import type { AnalystFinding } from '@/lib/api/analyst'
import {
  findingConversation,
  findingFigures,
  findingHeading,
  findingNoticed,
  findingTitle,
  findingWeekDate,
  findingWeekLabel,
} from '../findings'

const NOW = new Date('2026-11-15T09:00:00Z')

const finding = (over: Partial<AnalystFinding> = {}): AnalystFinding => ({
  id: 'f1',
  site_id: 's1',
  week: '2026-10-26',
  direction: 'fall',
  visitors: 72,
  usual: 171.5,
  change: -0.5802,
  outcome: 'answered',
  question: 'Why did visitors to example.com fall to 72 in the week of 26 October, against a usual 172?',
  answer: 'LinkedIn sent 9 visitors, down from 88 the week before.',
  steps: [{ tool: 'compare_periods', args: {}, ms: 12 }],
  follow_ups: ['Which pages did visitors from LinkedIn read?'],
  created_at: '2026-11-02T06:10:00Z',
  ...over,
})

describe('the words of a change', () => {
  it('names the change against a usual week, whole', () => {
    expect(findingTitle(finding())).toBe('Visitors fell 58%')
    expect(findingTitle(finding({ direction: 'rise', change: 0.4149 }))).toBe('Visitors rose 41%')
  })

  it('shows the figures, the usual level whole as the question has it', () => {
    expect(findingFigures(finding())).toBe('72 against a usual 172')
    expect(findingFigures(finding({ visitors: 12345, usual: 23456.4 }))).toBe('12,345 against a usual 23,456')
  })

  it('reads the week as a calendar date, with the year only when it is not this year', () => {
    expect(findingWeekDate('2026-10-26', NOW)).toBe('26 October')
    expect(findingWeekDate('2025-12-29', NOW)).toBe('29 December 2025')
    expect(findingWeekLabel('2026-10-26', NOW)).toBe('Week of 26 October')
    expect(findingHeading(finding(), NOW)).toBe('Visitors fell 58% in the week of 26 October')
  })

  it('says when Analyst noticed it, in the zone the person reads times in', () => {
    expect(findingNoticed('2026-11-02T06:10:00Z', 'UTC', NOW)).toBe('Noticed by Analyst on 2 November')
    // * 23:30 UTC on 1 November is already 2 November in Brussels.
    expect(findingNoticed('2026-11-01T23:30:00Z', 'Europe/Brussels', NOW)).toBe('Noticed by Analyst on 2 November')
    expect(findingNoticed('not a date', 'UTC', NOW)).toBe('Noticed by Analyst')
  })
})

describe('a change opened as a chat', () => {
  it("is one turn, its question Analyst's own, with the explanation, its lookups and what to ask next", () => {
    const chat = findingConversation(finding())
    expect(chat.turns).toHaveLength(1)
    const turn = chat.turns[0]
    expect(turn.asked_by_analyst).toBe(true)
    expect(turn.question).toBe(finding().question)
    expect(turn.answer).toBe(finding().answer)
    expect(turn.outcome).toBe('answered')
    expect(turn.steps).toHaveLength(1)
    expect(turn.follow_ups).toEqual(['Which pages did visitors from LinkedIn read?'])
    expect(chat.id).not.toBe(turn.conversation_id)
  })

  it('shows its own sentence while the explanation is being written, or when it could not be', () => {
    const pending = findingConversation(finding({ outcome: 'pending', answer: null, follow_ups: null })).turns[0]
    expect(pending.outcome).toBe('pending')
    expect(pending.answer).toBeNull()
    const failed = findingConversation(finding({ outcome: 'error', answer: null, follow_ups: ['x'] })).turns[0]
    expect(failed.outcome).toBe('finding_error')
    expect(failed.follow_ups).toBeNull()
  })
})
