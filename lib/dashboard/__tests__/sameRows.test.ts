import { describe, it, expect } from 'vitest'
import { addRowCounts, groupSameRows, leadingPart, mergeSameRows } from '@/lib/dashboard/sameRows'

// A list never draws the same row twice (lib/dashboard/sameRows.ts). What is pinned: rows are grouped by what
// they read, a merged row counts its parts, a rate is weighted by the visitors that carry one, and a list with
// nothing to merge comes back untouched.

const lower = (row: { name: string }) => row.name.toLowerCase()

describe('groupSameRows', () => {
  it('groups by what a row reads as, in the order each reading first appears', () => {
    const rows = [{ name: 'x' }, { name: 'LinkedIn' }, { name: 'X' }, { name: 'linkedin' }, { name: 'reddit' }]
    expect(groupSameRows(rows, lower)).toEqual([
      [{ name: 'x' }, { name: 'X' }],
      [{ name: 'LinkedIn' }, { name: 'linkedin' }],
      [{ name: 'reddit' }],
    ])
  })

  it('keeps every row: nothing is dropped and nothing is counted twice', () => {
    const rows = Array.from({ length: 40 }, (_, i) => ({ name: `Name${i % 7}`.concat(i % 2 ? '' : ' ') }))
    const groups = groupSameRows(rows, (row) => row.name.trim())
    expect(groups).toHaveLength(7)
    expect(groups.flat()).toHaveLength(rows.length)
    expect(new Set(groups.flat())).toEqual(new Set(rows))
  })
})

describe('addRowCounts', () => {
  it('adds pageviews and visitors', () => {
    expect(addRowCounts([{ pageviews: 10, visitors: 7 }, { pageviews: 5, visitors: 2 }])).toMatchObject({ pageviews: 15, visitors: 9 })
  })

  it('weights a rate by the visitors of the parts that carry one', () => {
    const merged = addRowCounts([
      { pageviews: 0, visitors: 30, bounce_rate: 50, avg_duration: 100 },
      { pageviews: 0, visitors: 10, bounce_rate: 10, avg_duration: 20 },
    ])
    expect(merged.bounce_rate).toBe((50 * 30 + 10 * 10) / 40)
    expect(merged.avg_duration).toBe((100 * 30 + 20 * 10) / 40)
  })

  it('gives a part with no rate no weight, so it cannot pull the mean toward zero', () => {
    const merged = addRowCounts([
      { pageviews: 0, visitors: 30, bounce_rate: 50, avg_duration: null },
      { pageviews: 0, visitors: 1000, bounce_rate: null, avg_duration: null },
    ])
    expect(merged.bounce_rate).toBe(50)
    expect(merged.avg_duration).toBeNull()
    expect(merged.visitors).toBe(1030)
  })

  it('has no rate where no part has one, never a zero', () => {
    expect(addRowCounts([{ pageviews: 1 }, { pageviews: 2 }])).toEqual({ pageviews: 3, visitors: 0, bounce_rate: null, avg_duration: null })
  })
})

describe('leadingPart', () => {
  it('is the part with the most visitors, then the most pageviews, then the first', () => {
    expect(leadingPart([{ name: 'a', pageviews: 9, visitors: 1 }, { name: 'b', pageviews: 1, visitors: 5 }]).name).toBe('b')
    expect(leadingPart([{ name: 'a', pageviews: 2, visitors: 5 }, { name: 'b', pageviews: 7, visitors: 5 }]).name).toBe('b')
    expect(leadingPart([{ name: 'a', pageviews: 7, visitors: 5 }, { name: 'b', pageviews: 7, visitors: 5 }]).name).toBe('a')
  })
})

describe('mergeSameRows', () => {
  it('hands back a list with nothing to merge untouched: the same rows in the same order', () => {
    const rows = [{ name: 'b', pageviews: 1, visitors: 1 }, { name: 'a', pageviews: 9, visitors: 9 }]
    const out = mergeSameRows(rows, lower)
    expect(out).toEqual(rows)
    expect(out[0]).toBe(rows[0])
    expect(out[1]).toBe(rows[1])
  })

  it('makes one row of the rows that read the same, drawn from its leading part, with the counts of all', () => {
    const rows = [
      { name: 'twitter', pageviews: 80, visitors: 68, bounce_rate: 40, avg_duration: 30 },
      { name: 'linkedin', pageviews: 12, visitors: 9, bounce_rate: null, avg_duration: null },
      { name: 'Twitter', pageviews: 6, visitors: 5, bounce_rate: 60, avg_duration: 90 },
    ]
    const out = mergeSameRows(rows, lower)
    expect(out.map((row) => row.name)).toEqual(['twitter', 'linkedin'])
    expect(out[0]).toMatchObject({ pageviews: 86, visitors: 73 })
    expect(out[0].bounce_rate).toBeCloseTo((40 * 68 + 60 * 5) / 73)
    // The row that read like no other is the very row that came in.
    expect(out[1]).toBe(rows[1])
  })

  it('ranks a merged row by its own count: two small rows can pass a larger one', () => {
    const rows = [
      { name: 'b', pageviews: 10, visitors: 10 },
      { name: 'a', pageviews: 6, visitors: 6 },
      { name: 'A', pageviews: 6, visitors: 6 },
    ]
    expect(mergeSameRows(rows, lower).map((row) => [row.name, row.visitors])).toEqual([['a', 12], ['b', 10]])
  })

  it('lets a list add what a merged row carries, from all of its parts', () => {
    type Row = { name: string; names?: string[]; pageviews: number; visitors: number }
    const rows: Row[] = [{ name: 'fb', pageviews: 1, visitors: 1 }, { name: 'FB', pageviews: 3, visitors: 2 }, { name: 'x', pageviews: 1, visitors: 1 }]
    const out = mergeSameRows(rows, lower, (parts) => ({ names: parts.map((part) => part.name) }))
    expect(out).toEqual([
      { name: 'FB', names: ['fb', 'FB'], pageviews: 4, visitors: 3, bounce_rate: null, avg_duration: null },
      { name: 'x', names: ['x'], pageviews: 1, visitors: 1 },
    ])
  })

  it('never loses a visitor: the total before is the total after', () => {
    const rows = Array.from({ length: 60 }, (_, i) => ({ name: `Brand${i % 9}`.concat(i % 3 === 0 ? ' ' : ''), pageviews: i * 3, visitors: i + 1 }))
    const total = (list: Array<{ visitors?: number; pageviews: number }>, key: 'visitors' | 'pageviews') => list.reduce((sum, row) => sum + (row[key] ?? 0), 0)
    const out = mergeSameRows(rows, (row) => row.name.trim())
    expect(out).toHaveLength(9)
    expect(total(out, 'visitors')).toBe(total(rows, 'visitors'))
    expect(total(out, 'pageviews')).toBe(total(rows, 'pageviews'))
    // No reading is drawn twice.
    expect(new Set(out.map((row) => row.name.trim())).size).toBe(out.length)
  })
})
