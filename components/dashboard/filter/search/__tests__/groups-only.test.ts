import { describe, it, expect } from 'vitest'
import { EVENT_KIND, EVENT_PROPERTY_SCOPE, OUTBOUND_KIND } from '@/lib/filters'
import { ENTRY_DIMENSION, JOURNEY_EVENT_FILTER_DIMENSIONS, JOURNEY_FILTER_DIMENSIONS } from '@/lib/hooks/useJourneyFilters'
import { EVENT_FILTER_GROUPS, GROUPS, groupsOnly } from '../values'

// The Search filter offers a page only the kinds its read answers (`only`, the new Journeys page). Without `only` the
// dashboard's filter must stay exactly as it was: the very same group lists, not copies.
describe('groupsOnly', () => {
  it('returns the very same groups when no kinds are named', () => {
    expect(groupsOnly(GROUPS)).toBe(GROUPS)
    expect(groupsOnly(EVENT_FILTER_GROUPS, undefined)).toBe(EVENT_FILTER_GROUPS)
  })

  it('offers the journeys read kinds only, the entry page first in its own group', () => {
    const groups = groupsOnly(GROUPS, JOURNEY_FILTER_DIMENSIONS)
    expect(groups[0]).toEqual({ label: 'Journey', dimensions: [ENTRY_DIMENSION] })
    expect(groups.flatMap((g) => g.dimensions).sort()).toEqual([...JOURNEY_FILTER_DIMENSIONS].sort())
    expect(groups.every((g) => g.dimensions.length > 0)).toBe(true)
  })

  it("keeps the dashboard's order for the kinds it keeps", () => {
    const kept = groupsOnly(GROUPS, JOURNEY_FILTER_DIMENSIONS).slice(1).flatMap((g) => g.dimensions)
    const order = GROUPS.flatMap((g) => g.dimensions).filter((d) => kept.includes(d))
    expect(kept).toEqual(order)
  })

  it('keeps the event kinds the journeys read answers', () => {
    const offered = groupsOnly(EVENT_FILTER_GROUPS, JOURNEY_EVENT_FILTER_DIMENSIONS).flatMap((g) => g.dimensions)
    expect(offered).toEqual(expect.arrayContaining([EVENT_KIND, EVENT_PROPERTY_SCOPE, OUTBOUND_KIND, ENTRY_DIMENSION]))
    expect(offered.sort()).toEqual([...JOURNEY_EVENT_FILTER_DIMENSIONS].sort())
  })

  it('leaves out a kind that no group names', () => {
    const groups = groupsOnly(GROUPS, ['country', 'not_a_kind'])
    expect(groups.flatMap((g) => g.dimensions)).toEqual(['country'])
  })
})
