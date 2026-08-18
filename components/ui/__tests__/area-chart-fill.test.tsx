import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { AreaChart, Area } from '@/components/ui/area-chart'

// jsdom has no ResizeObserver (ParentSize measures the wrapper with one).
vi.stubGlobal('ResizeObserver', class {
  observe() {}
  unobserve() {}
  disconnect() {}
})

// fillParent inverts the chart's height authority: the wrapper takes the
// parent's height (h-full) instead of deriving height from width via
// aspect-ratio. The command deck's full-height chart depends on this.
describe('AreaChart sizing', () => {
  it('derives height from aspect-ratio by default', () => {
    const { container } = render(
      <AreaChart data={[]} aspectRatio="2.9 / 1"><Area dataKey="v" /></AreaChart>
    )
    const wrapper = container.firstElementChild as HTMLElement
    expect(wrapper.style.aspectRatio).toBe('2.9 / 1')
    expect(wrapper.className).not.toContain('h-full')
  })

  it('fills the parent height with fillParent — no aspect-ratio', () => {
    const { container } = render(
      <AreaChart data={[]} fillParent><Area dataKey="v" /></AreaChart>
    )
    const wrapper = container.firstElementChild as HTMLElement
    expect(wrapper.style.aspectRatio).toBe('')
    expect(wrapper.className).toContain('h-full')
  })
})
