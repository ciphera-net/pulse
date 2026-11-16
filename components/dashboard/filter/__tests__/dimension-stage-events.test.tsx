import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

// The old picker (a funnel's page, Journeys, Settings → Export) under the event-filters beta (R45 of 15-11-2026):
// its Events group offers an event and an outbound link in place of the row test event_name, each named as the
// pills name it.

let beta = false
vi.mock('@/lib/features', () => ({ useFeature: (flag: string) => (flag === 'event-filters' ? beta : false) }))

import DimensionStage from '../DimensionStage'
import { OUTBOUND_KIND } from '@/lib/filters'

beforeAll(() => {
  // jsdom draws nothing, so it has no scrollIntoView; the stage scrolls its highlighted row into view.
  Element.prototype.scrollIntoView = vi.fn()
})

afterEach(() => {
  cleanup()
  beta = false
})

const kinds = () => screen.getAllByRole('option').map((o) => o.id.replace('filter-dim-', ''))

describe('DimensionStage and the event filter', () => {
  it('offers event_name without the beta', () => {
    render(<DimensionStage activeDimensions={new Set()} onPick={() => {}} onClose={() => {}} />)
    expect(kinds()).toContain('event_name')
    expect(kinds()).not.toContain('event')
  })

  it('offers an event and an outbound link with the beta, by their names', () => {
    beta = true
    render(<DimensionStage activeDimensions={new Set()} onPick={() => {}} onClose={() => {}} />)
    expect(kinds()).toEqual(expect.arrayContaining(['event', OUTBOUND_KIND]))
    expect(kinds()).not.toContain('event_name')
    expect(screen.getByRole('option', { name: /Outbound link/ })).toBeTruthy()
  })

  it('keeps a page\'s allowlist: Journeys offers the two only when its list names them', () => {
    beta = true
    render(<DimensionStage activeDimensions={new Set()} onPick={() => {}} onClose={() => {}} allowed={['country', 'event', OUTBOUND_KIND]} />)
    expect(kinds().sort()).toEqual(['country', 'event', OUTBOUND_KIND].sort())
  })
})
