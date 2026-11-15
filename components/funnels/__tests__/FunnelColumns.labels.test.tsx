import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'

// The step labels under the funnel chart (components/funnels/FunnelColumns.tsx). jsdom measures nothing, so the
// chart is handed its width by a stand-in for ParentSize, as the performance chart's tests do.
const size = vi.hoisted(() => ({ width: 800 }))
vi.mock('@/lib/charts/primitives', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/charts/primitives')>()
  return {
    ...mod,
    ParentSize: ({ children }: { children: (s: { width: number; height: number }) => React.ReactNode }) => <div>{children({ width: size.width, height: 310 })}</div>,
  }
})

import { COMPLETED_TAG_ROOM, FunnelColumns } from '@/components/funnels/FunnelColumns'

const steps = [1000, 600, 300, 120].map((visitors, i) => ({
  step: { name: `Step ${i + 1}`, value: i === 3 ? 'purchase' : `/page-${i + 1}`, category: i === 3 ? 'event' : 'page' } as never,
  visitors,
  dropoff: null,
  conversion: null,
  exit_pages: [],
}))
const labels = (container: HTMLElement) => [...container.querySelectorAll<HTMLElement>('[data-funnel-label]')]

describe('FunnelColumns: the step labels stay inside the chart', () => {
  it('no label reaches past the chart: the last one ends at its right edge', () => {
    size.width = 560
    const { container } = render(<FunnelColumns steps={steps} />)
    for (const label of labels(container)) {
      const left = parseFloat(label.style.left)
      const max = parseFloat(label.style.maxWidth)
      expect(left + max).toBeLessThanOrEqual(560)
    }
  })

  it('draws the "completed" tag where the last label has room for it (a block on a computer)', () => {
    size.width = 560
    const { container } = render(<FunnelColumns steps={steps} />)
    const last = labels(container)[3]
    expect(parseFloat(last.style.maxWidth)).toBeGreaterThanOrEqual(COMPLETED_TAG_ROOM)
    expect(last.textContent).toContain('completed')
  })

  it('leaves the tag out where it would run past its label (the block on a phone); the name stays', () => {
    size.width = 306
    const { container } = render(<FunnelColumns steps={steps} />)
    const last = labels(container)[3]
    expect(parseFloat(last.style.maxWidth)).toBeLessThan(COMPLETED_TAG_ROOM)
    expect(last.textContent).not.toContain('completed')
    expect(last.textContent).toContain('purchase')
  })
})
