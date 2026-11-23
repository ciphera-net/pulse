import { describe, it, expect } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import type { DimensionFilter, FilterSuggestion } from '@/lib/filters'
import { SUGGESTION_READS_AT_ONCE, useFilterValues } from '../values'

// PUL-94: the Filter button reads every kind's list when the pointer reaches it. Each read is a ClickHouse query on
// the dashboard's shared limit (16 at once for every customer together), and all ~17 kinds at once made one hover more
// than that whole limit. The lists are read SUGGESTION_READS_AT_ONCE at a time, and a reading that a newer one (other
// filters, another range) replaces stops asking.

const KINDS = Array.from({ length: 17 }, (_, i) => `kind-${i}`)
const NO_FILTERS: DimensionFilter[] = []

describe('the Filter button reads its lists a few at a time (PUL-94)', () => {
  it(`reads every kind, never more than ${SUGGESTION_READS_AT_ONCE} at once`, async () => {
    let inflight = 0
    let peak = 0
    const fetchSuggestions = async (dimension: string): Promise<FilterSuggestion[]> => {
      inflight++
      peak = Math.max(peak, inflight)
      await new Promise((resolve) => setTimeout(resolve, 3))
      inflight--
      return [{ value: dimension, label: dimension, count: 1 }]
    }
    const { result } = renderHook(() =>
      useFilterValues({ on: true, fetchSuggestions, pageValues: {}, filters: NO_FILTERS, dimensions: KINDS }),
    )
    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(Object.keys(result.current.values).sort()).toEqual([...KINDS].sort())
    expect(peak).toBe(SUGGESTION_READS_AT_ONCE)
  })

  it('stops asking once a newer reading replaces it', async () => {
    const asked: string[] = []
    const gates: Array<() => void> = []
    const fetchSuggestions = (dimension: string) => {
      asked.push(dimension)
      return new Promise<FilterSuggestion[]>((resolve) => gates.push(() => resolve([{ value: dimension, label: dimension, count: 1 }])))
    }
    const { result, rerender } = renderHook(
      ({ filters }: { filters: DimensionFilter[] }) =>
        useFilterValues({ on: true, fetchSuggestions, pageValues: {}, filters, dimensions: KINDS }),
      { initialProps: { filters: NO_FILTERS } },
    )
    await waitFor(() => expect(asked).toHaveLength(SUGGESTION_READS_AT_ONCE))
    // A filter goes on while the first reading's first reads are still out: a new reading starts.
    rerender({ filters: [{ dimension: 'kind-16', operator: 'is', values: ['x'] } as DimensionFilter] })
    await waitFor(() => expect(asked).toHaveLength(2 * SUGGESTION_READS_AT_ONCE))
    for (let i = 0; i < 500 && !result.current.ready; i++) {
      gates.splice(0).forEach((open) => open())
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
    expect(result.current.ready).toBe(true)
    // The replaced reading asked for its first reads only; the newer one asked for every kind.
    expect(asked).toHaveLength(SUGGESTION_READS_AT_ONCE + KINDS.length)
  })
})
