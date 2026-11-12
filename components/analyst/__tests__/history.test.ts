// Past chats on the Analyst page (PUL-78, round 6): the rows pulse-backend's conversations become, the day each one
// is labelled with in the zone the person reads times in, and the messages a reopened chat starts with.
import { describe, it, expect } from 'vitest'
import type { AnalystConversation, AnalystTurn } from '@/lib/api/analyst'
import { chatMessages, chatWhenLabel, recentChats } from '../history'

const turn = (id: string, question: string, createdAt: string, over: Partial<AnalystTurn> = {}): AnalystTurn => ({
  id,
  conversation_id: 'c',
  site_id: 's1',
  question,
  answer: `Answer to ${question}`,
  outcome: 'answered',
  steps: [],
  created_at: createdAt,
  ...over,
})

const conversation = (id: string, turns: AnalystTurn[]): AnalystConversation => ({
  id,
  started_at: turns[0]?.created_at ?? '2026-11-10T00:00:00Z',
  turns,
})

describe('recentChats', () => {
  it("titles each chat with its first question and dates it by its latest turn, in the server's order", () => {
    const rows = recentChats([
      conversation('c2', [turn('t3', 'Which pages are growing?', '2026-11-10T21:15:00Z')]),
      conversation('c1', [
        turn('t1', 'Why did visitors change this week?', '2026-11-09T18:02:00Z'),
        turn('t2', 'And last month?', '2026-11-10T22:40:00Z'),
      ]),
    ])
    expect(rows.map((r) => [r.chat.id, r.title, r.lastAt])).toEqual([
      ['c2', 'Which pages are growing?', '2026-11-10T21:15:00Z'],
      ['c1', 'Why did visitors change this week?', '2026-11-10T22:40:00Z'],
    ])
  })

  it('leaves out a chat with no turns', () => {
    expect(recentChats([conversation('c1', [])])).toEqual([])
  })
})

describe('chatWhenLabel', () => {
  const now = new Date('2026-11-11T09:00:00Z')

  it('gives the time for today, Yesterday, the day and month this year, and the year before that', () => {
    expect(chatWhenLabel('2026-11-11T07:40:00Z', 'Europe/Brussels', now)).toBe('08:40')
    expect(chatWhenLabel('2026-11-10T12:00:00Z', 'Europe/Brussels', now)).toBe('Yesterday')
    expect(chatWhenLabel('2026-11-03T12:00:00Z', 'Europe/Brussels', now)).toBe('3 Nov')
    expect(chatWhenLabel('2025-12-28T12:00:00Z', 'Europe/Brussels', now)).toBe('28 Dec 2025')
  })

  it("decides the day in the person's zone, not the machine's", () => {
    // * 23:30 UTC on the 10th is 00:30 on the 11th in Brussels.
    expect(chatWhenLabel('2026-11-10T23:30:00Z', 'UTC', now)).toBe('Yesterday')
    expect(chatWhenLabel('2026-11-10T23:30:00Z', 'Europe/Brussels', now)).toBe('00:30')
  })

  it('counts calendar days, so the day the clocks go back is still yesterday', () => {
    // * 25 October 2026 lasts 25 hours in Brussels: 33 hours before 10:00 UTC on the 26th is still the 25th there.
    expect(chatWhenLabel('2026-10-25T00:30:00Z', 'Europe/Brussels', new Date('2026-10-26T10:00:00Z'))).toBe('Yesterday')
  })

  it('says nothing for a time it cannot read', () => {
    expect(chatWhenLabel('not a time', 'Europe/Brussels', now)).toBe('')
  })
})

describe('chatMessages', () => {
  it('gives each turn as its question, then its answer with the figures behind it', () => {
    const step = { tool: 'get_stats', args: {}, ms: 80, result: { visitors: 56 } }
    const messages = chatMessages(
      conversation('c1', [
        turn('t1', 'Why did visitors change?', '2026-11-10T21:00:00Z', { steps: [step] }),
        turn('t2', 'And last month?', '2026-11-10T21:05:00Z', { answer: null, outcome: 'limit', steps: null }),
      ]),
    )
    expect(messages.map((m) => [m.id, m.role])).toEqual([
      ['t1-question', 'user'],
      ['t1-answer', 'assistant'],
      ['t2-question', 'user'],
      ['t2-answer', 'assistant'],
    ])
    expect(messages[0].content).toEqual([{ type: 'text', text: 'Why did visitors change?' }])
    expect(messages[1].content).toEqual([
      { type: 'tool-call', toolCallId: 't1-0', toolName: 'get_stats', args: {}, argsText: '{}', result: step },
      { type: 'text', text: 'Answer to Why did visitors change?' },
    ])
    // * A turn that ran out of lookups says so in the answer's place, as it did when it was asked.
    expect(messages[3].content).toEqual([
      { type: 'text', text: 'This question needed more lookups than one answer allows. Try asking about one thing at a time.' },
    ])
    expect(messages[2].createdAt).toEqual(new Date('2026-11-10T21:05:00Z'))
  })

  it("keeps each answer's follow-up questions with it, so a reopened chat offers them again", () => {
    const messages = chatMessages(
      conversation('c1', [turn('t1', 'Why did visitors change?', '2026-11-10T21:00:00Z', { follow_ups: ['Which pages grew most?'] })]),
    )
    expect(messages[1].metadata).toEqual({ custom: { followUps: ['Which pages grew most?'], skippedLookups: 0, lookupsRan: 0 } })
  })
})
