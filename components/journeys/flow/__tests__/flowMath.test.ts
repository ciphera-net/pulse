import { describe, expect, it } from 'vitest'
import type { JourneyFlow } from '@/lib/api/journeys'
import {
  OTHER,
  entryOnlyTotal,
  foldFlow,
  leftAt,
  nextOf,
  otherIndices,
  otherPages,
  otherVisits,
  routeThrough,
  sessionsAt,
  sliceFlow,
  stepVisits,
  wentOnFrom,
} from '../flowMath'

// A three-step read: 10 journeys from "/" or "/a" (or a page under the cut) on to "/b" or "/c", 8 of them on to a
// third page; and 7 visits that saw one page only (4 on "/", 1 on "/a", 2 on pages outside the first step's top).
const flow: JourneyFlow = {
  depth: 3,
  total_sessions: 10,
  columns: [
    { total_sessions: 10, pages: 3, top: [['/', 6], ['/a', 3]], other_sessions: 1, other_pages: 1 },
    { total_sessions: 10, pages: 2, top: [['/b', 7], ['/c', 3]], other_sessions: 0, other_pages: 0 },
    { total_sessions: 8, pages: 2, top: [['/d', 5], ['/e', 3]], other_sessions: 0, other_pages: 0 },
  ],
  links: [
    [0, 0, 0, 5], [0, 0, 1, 1], [0, 1, 0, 2], [0, 1, 1, 1], [0, OTHER, 1, 1],
    [1, 0, 0, 4], [1, 0, 1, 2], [1, 1, 1, 1], [1, 1, 0, 1],
  ],
  entry_only: [4, 1],
  entry_only_other: 2,
}

describe('the journeys read with the visits that saw one page', () => {
  it('counts every visit that began on a page at the first step, the ones that left there included', () => {
    expect(sessionsAt(flow, 0, 0)).toBe(10) // 6 went on, 4 saw "/" only
    expect(sessionsAt(flow, 0, OTHER)).toBe(3) // 1 went on, 2 saw a page outside the top only
    expect(stepVisits(flow, 0)).toBe(17)
    expect(entryOnlyTotal(flow)).toBe(7)
  })
  it('leaves the later steps as the read gives them', () => {
    expect(sessionsAt(flow, 1, 0)).toBe(7)
    expect(stepVisits(flow, 1)).toBe(10)
  })
  it('says who left on a page: its visits less those that went on, unknown at the last step read', () => {
    expect(leftAt(flow, 0, 0)).toBe(4)
    expect(leftAt(flow, 0, 1)).toBe(1)
    expect(leftAt(flow, 1, 0)).toBe(1) // 7 on "/b", 6 went on
    expect(leftAt(flow, 2, 0)).toBeNull()
    expect(wentOnFrom(flow, 0, new Set([0]))).toBe(6)
  })
  it('reads a server that does not count them (no entry_only) as before', () => {
    const old: JourneyFlow = { ...flow, entry_only: undefined, entry_only_other: undefined }
    expect(sessionsAt(old, 0, 0)).toBe(6)
    expect(stepVisits(old, 0)).toBe(10)
    expect(leftAt(old, 0, 0)).toBe(0)
  })
})

describe('Other pages', () => {
  it('holds the step’s own figure at a cut, the visits between two other pages included', () => {
    // Keeping one page at the first step: "/a" (4 visits) and the rest (3) are Other pages.
    expect(otherVisits(flow, 0, 1)).toBe(7)
    expect(otherPages(flow, 0, 1)).toBe(2)
    expect([...otherIndices(flow, 0, 1)].sort()).toEqual([OTHER, 1].sort())
  })
})

describe('the read cut and folded', () => {
  it('cuts to fewer steps exactly as a read at that depth', () => {
    const two = sliceFlow(flow, 2)
    expect(two.depth).toBe(2)
    expect(two.columns).toHaveLength(2)
    expect(two.links.every(([h]) => h === 0)).toBe(true)
    expect(sliceFlow(flow, 3)).toBe(flow)
  })
  it('folds pages past a cut into Other pages, links and one-page visits with them', () => {
    const folded = foldFlow(flow, () => 1)
    expect(folded.columns[0].top).toEqual([['/', 6]])
    expect(folded.columns[0].other_sessions).toBe(4)
    expect(folded.entry_only).toEqual([4])
    expect(folded.entry_only_other).toBe(3)
    // "/a" → "/b" (2) is now Other pages → "/b". At step 2 every step keeps one page too, so "/c" → "/e" is Other
    // pages → Other pages, and "/c" → "/d" is Other pages → "/d".
    expect(folded.links).toContainEqual([0, OTHER, 0, 2])
    expect(folded.links).toContainEqual([1, OTHER, OTHER, 1])
    expect(folded.links).toContainEqual([1, OTHER, 0, 1])
    // Every visit is still there.
    expect(stepVisits(folded, 0)).toBe(stepVisits(flow, 0))
  })
})

describe('where a page’s visits went next', () => {
  it('names the busiest page after it and how many pages', () => {
    const next = nextOf(flow, 0, new Set([0]))
    expect(next.on).toBe(6)
    expect(next.top).toEqual({ path: '/b', n: 5 })
    expect(next.named).toBe(2)
    expect(next.more).toBe(false)
  })
})

describe('the busiest route through a page', () => {
  it('follows the heaviest link back and forth from it, never into Other pages', () => {
    const links = [
      { source: '0:/', target: '1:/b', value: 5 },
      { source: '0:(other)', target: '1:/b', value: 9 },
      { source: '0:/a', target: '1:/b', value: 2 },
      { source: '1:/b', target: '2:/d', value: 4 },
      { source: '1:/b', target: '2:/e', value: 2 },
    ]
    expect(routeThrough(links, '1:/b')).toEqual(['/', '/b', '/d'])
  })
})
