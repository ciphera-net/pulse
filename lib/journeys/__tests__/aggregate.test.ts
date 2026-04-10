import { describe, it, expect } from 'vitest'
import { aggregateJourney } from '../aggregate'
import type { PathTransition } from '@/lib/api/journeys'

describe('aggregateJourney', () => {
  it('returns empty array for empty input', () => {
    const result = aggregateJourney([], { depth: 4, maxPagesPerStep: 20 })
    expect(result).toEqual([])
  })

  it('returns exactly `depth` steps when transitions cover all steps', () => {
    const transitions: PathTransition[] = [
      { from_path: '/', to_path: '/a', step_index: 0, session_count: 10 },
      { from_path: '/a', to_path: '/b', step_index: 1, session_count: 7 },
      { from_path: '/b', to_path: '/c', step_index: 2, session_count: 4 },
    ]
    const result = aggregateJourney(transitions, { depth: 3, maxPagesPerStep: 20 })
    expect(result).toHaveLength(3)
    expect(result[0].index).toBe(0)
    expect(result[1].index).toBe(1)
    expect(result[2].index).toBe(2)
  })

  it('step 0 uses from_path of transitions at step_index 0', () => {
    const transitions: PathTransition[] = [
      { from_path: '/', to_path: '/a', step_index: 0, session_count: 10 },
      { from_path: '/b', to_path: '/c', step_index: 0, session_count: 5 },
    ]
    const result = aggregateJourney(transitions, { depth: 2, maxPagesPerStep: 20 })
    expect(result[0].pages.map((p) => p.path)).toEqual(['/', '/b'])
    expect(result[0].pages[0].sessionCount).toBe(10)
    expect(result[0].pages[1].sessionCount).toBe(5)
  })

  it('step k > 0 uses to_path of transitions at step_index = k-1', () => {
    const transitions: PathTransition[] = [
      { from_path: '/', to_path: '/a', step_index: 0, session_count: 10 },
      { from_path: '/', to_path: '/b', step_index: 0, session_count: 5 },
    ]
    const result = aggregateJourney(transitions, { depth: 2, maxPagesPerStep: 20 })
    expect(result[1].pages.map((p) => p.path)).toEqual(['/a', '/b'])
  })

  it('sums session counts for the same path in a step', () => {
    const transitions: PathTransition[] = [
      { from_path: '/', to_path: '/a', step_index: 0, session_count: 10 },
      { from_path: '/', to_path: '/b', step_index: 0, session_count: 5 },
    ]
    const result = aggregateJourney(transitions, { depth: 2, maxPagesPerStep: 20 })
    expect(result[0].pages[0]).toEqual({ path: '/', sessionCount: 15, isOther: false })
  })

  it('rolls paths beyond maxPagesPerStep into an (other) bucket', () => {
    const transitions: PathTransition[] = [
      { from_path: '/a', to_path: '/x', step_index: 0, session_count: 10 },
      { from_path: '/b', to_path: '/x', step_index: 0, session_count: 8 },
      { from_path: '/c', to_path: '/x', step_index: 0, session_count: 5 },
      { from_path: '/d', to_path: '/x', step_index: 0, session_count: 3 },
      { from_path: '/e', to_path: '/x', step_index: 0, session_count: 1 },
    ]
    const result = aggregateJourney(transitions, { depth: 1, maxPagesPerStep: 3 })
    const pages = result[0].pages
    expect(pages).toHaveLength(4)
    expect(pages.slice(0, 3).map((p) => p.path)).toEqual(['/a', '/b', '/c'])
    expect(pages[3]).toEqual({ path: '(other)', sessionCount: 4, isOther: true })
  })

  it('does not create (other) bucket when pages fit within maxPagesPerStep', () => {
    const transitions: PathTransition[] = [
      { from_path: '/a', to_path: '/x', step_index: 0, session_count: 10 },
      { from_path: '/b', to_path: '/x', step_index: 0, session_count: 5 },
    ]
    const result = aggregateJourney(transitions, { depth: 1, maxPagesPerStep: 20 })
    expect(result[0].pages).toHaveLength(2)
    expect(result[0].pages.find((p) => p.isOther)).toBeUndefined()
  })

  it('calculates visitors as sum of session counts for the step', () => {
    const transitions: PathTransition[] = [
      { from_path: '/a', to_path: '/x', step_index: 0, session_count: 10 },
      { from_path: '/b', to_path: '/y', step_index: 0, session_count: 5 },
    ]
    const result = aggregateJourney(transitions, { depth: 2, maxPagesPerStep: 20 })
    expect(result[0].visitors).toBe(15)
    expect(result[1].visitors).toBe(15)
  })

  it('drop-off % is 0 for step 0', () => {
    const transitions: PathTransition[] = [
      { from_path: '/', to_path: '/a', step_index: 0, session_count: 10 },
    ]
    const result = aggregateJourney(transitions, { depth: 1, maxPagesPerStep: 20 })
    expect(result[0].dropOffPercent).toBe(0)
  })

  it('drop-off % is calculated vs previous step', () => {
    const transitions: PathTransition[] = [
      { from_path: '/', to_path: '/a', step_index: 0, session_count: 10 },
      { from_path: '/a', to_path: '/b', step_index: 1, session_count: 4 },
    ]
    const result = aggregateJourney(transitions, { depth: 3, maxPagesPerStep: 20 })
    expect(result[0].visitors).toBe(10)
    expect(result[1].visitors).toBe(10)
    expect(result[2].visitors).toBe(4)
    expect(result[2].dropOffPercent).toBe(-60)
  })

  it('trims empty trailing steps', () => {
    const transitions: PathTransition[] = [
      { from_path: '/', to_path: '/a', step_index: 0, session_count: 10 },
    ]
    const result = aggregateJourney(transitions, { depth: 5, maxPagesPerStep: 20 })
    expect(result).toHaveLength(2)
  })

  it('keeps at least one step even if transitions are all empty after step 0', () => {
    const transitions: PathTransition[] = []
    const result = aggregateJourney(transitions, { depth: 5, maxPagesPerStep: 20 })
    expect(result).toEqual([])
  })
})
