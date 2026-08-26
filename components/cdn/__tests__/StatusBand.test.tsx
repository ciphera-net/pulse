import { describe, expect, it, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

// jsdom has no ResizeObserver (the axis row's ParentSize measures with one).
vi.stubGlobal('ResizeObserver', class {
  observe() {}
  unobserve() {}
  disconnect() {}
})

import { OriginCard } from '../CdnSplitInstrument'
import type { CdnPoint, StatusMix } from '../cdnMetrics'

// Pins closeout ruling 4a: the status band carries the cdn_status_band glyph
// on its "of N responses" summary — the entry was written and documented but
// orphaned (zero call sites) until this placement.

const point = (over: Partial<CdnPoint> = {}): CdnPoint => ({
  date: new Date('2026-08-20T00:00:00Z'),
  bandwidth: 1000,
  bandwidthCached: 800,
  bandwidthOrigin: 200,
  requests: 250,
  requestsCached: 200,
  hitRate: 80,
  originMs: 25,
  e3xx: 5,
  e4xx: 3,
  e5xx: 1,
  ...over,
})

const mix: StatusMix = { total: 250, c2xx: 241, c3xx: 5, c4xx: 3, c5xx: 1 }

const props = {
  series: [point()],
  overview: undefined,
  regions: undefined,
  regionsTotal: 0,
  regionsError: false,
  onRetryRegions: () => {},
  mix,
}

afterEach(cleanup)

describe('StatusBand glyph (ruling 4a)', () => {
  it('the "of N responses" summary carries the cdn_status_band glyph', () => {
    render(<OriginCard {...props} />)
    expect(screen.getByText(/of 250 responses/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /response status composition/i })).toBeTruthy()
  })

  it('ghost mode renders no band and no glyph', () => {
    render(<OriginCard {...props} ghost />)
    expect(screen.queryByText(/of 250 responses/)).toBeNull()
    expect(screen.queryByRole('button', { name: /response status composition/i })).toBeNull()
  })
})
