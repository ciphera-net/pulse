import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import type { JourneyFlow, JourneyFlowLink } from '@/lib/api/journeys'
import FlowChart from '../FlowChart'

vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams('') }))

// The chart measures its box (a ResizeObserver and clientWidth), which jsdom does not lay out: a box 1,200 px wide.
const width = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth')
beforeAll(() => {
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1200 })
})
afterAll(() => {
  if (width) Object.defineProperty(HTMLElement.prototype, 'clientWidth', width)
})

// A small site: one starting page, ten pages at step 2 (every one of them in the read's top, nothing under its cut),
// two at step 3. The chart keeps six pages a step, so step 2 draws six and "Other pages" (four pages).
function smallSite(): JourneyFlow {
  const second = Array.from({ length: 10 }, (_, i) => [`/p${i}`, 10] as [string, number])
  const links: JourneyFlowLink[] = [
    ...second.map((_, i) => [0, 0, i, 10] as JourneyFlowLink),
    ...second.map((_, i) => [1, i, i % 2, 5] as JourneyFlowLink),
  ]
  return {
    depth: 3,
    total_sessions: 100,
    columns: [
      { total_sessions: 100, pages: 1, top: [['/', 100]], other_sessions: 0, other_pages: 0 },
      { total_sessions: 100, pages: 10, top: second, other_sessions: 0, other_pages: 0 },
      { total_sessions: 50, pages: 2, top: [['/a', 25], ['/b', 25]], other_sessions: 0, other_pages: 0 },
    ],
    links,
  }
}

describe('FlowChart', () => {
  it('keeps a press on "Other pages" when opening it leaves nothing under the cut', () => {
    const slot = document.createElement('div')
    document.body.appendChild(slot)
    const flow = smallSite()
    const { container } = render(<FlowChart flow={flow} deep={flow} cardSlot={slot} />)
    const other = container.querySelector('[data-journeys-node="1:(other)"]')
    expect(other).not.toBeNull()
    fireEvent.click(other as Element)
    // All ten pages are drawn at step 2 now, and no "Other pages" strip is left.
    expect(container.querySelectorAll('[data-journeys-node^="1:"]').length).toBe(10)
    expect(container.querySelector('[data-journeys-node="1:(other)"]')).toBeNull()
    // The press stays: the four opened pages are highlighted, and the card for "Other pages" is open.
    const pressed = [...container.querySelectorAll('[data-journeys-node^="1:"][data-journeys-node-tone="pressed"]')].map((n) => n.getAttribute('data-journeys-node'))
    expect(pressed.sort()).toEqual(['1:/p6', '1:/p7', '1:/p8', '1:/p9'])
    expect(slot.querySelector('[data-journeys-card="other"]')).not.toBeNull()
    slot.remove()
  })
})
