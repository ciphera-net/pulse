import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/lib/skeleton/band', () => ({ registerBar: () => () => undefined }))
const useDailyStats = vi.fn()
vi.mock('@/lib/swr/dashboard', () => ({ useDailyStats: (...args: unknown[]) => useDailyStats(...args) }))

import PeakHours from '@/components/dashboard/PeakHours'
import { HeatMapSkeletonBody } from '@/components/skeleton/HeatMapSkeletonBody'
import { DashboardFrameSkeleton } from '@/components/skeleton/DashboardFrameSkeleton'
import { DashboardFrameProvider } from '@/lib/dashboard/frame'
import { heatRowsHeight } from '@/lib/dashboard/heatmapGrid'

// The heat map while it loads, at the size its data will take. jsdom lays nothing out: what is pinned is the
// construction (the body's floor, the rows' bar on the grid's own arithmetic, the lines around it), and that the
// dashboard's skeleton and the heat map's own loading state in the frame are the same body. The heights
// themselves were measured on the page, from 390 to 1920 px wide.

const dateRange = { start: '2026-08-11', end: '2026-08-18' }
const loading = { data: undefined, error: undefined, isLoading: true, mutate: vi.fn() }

beforeEach(() => {
  useDailyStats.mockReset()
})

describe('HeatMapSkeletonBody', () => {
  it('keeps the loaded body\'s floor and centres what is in it, 2 px between its parts', () => {
    const { container } = render(<HeatMapSkeletonBody />)
    const body = container.firstElementChild as HTMLElement
    for (const c of ['min-h-[270px]', 'flex-1', 'flex-col', 'justify-center', 'gap-[2px]']) expect(body.className.split(' '), c).toContain(c)
    // The axis row, the seven rows, the legend.
    expect(body.children).toHaveLength(3)
    expect(body.children[0].className.split(' ')).toEqual(expect.arrayContaining(['h-3', 'mb-1']))
    expect(body.children[2].className.split(' ')).toEqual(expect.arrayContaining(['mt-2', 'h-[11px]']))
  })

  it('draws the seven rows as ONE bar whose height comes from its own width', () => {
    const { container } = render(<HeatMapSkeletonBody />)
    const rows = container.firstElementChild!.children[1] as HTMLElement
    // The day names' column beside it, as wide as the real one (28 px and 6 px).
    expect(rows.className.split(' ')).toContain('gap-1.5')
    expect(rows.children[0].className.split(' ')).toEqual(expect.arrayContaining(['w-7', 'shrink-0']))
    const bars = rows.querySelectorAll<HTMLElement>('.skeleton')
    expect(bars).toHaveLength(1)
    expect(bars[0].style.paddingBottom).toBe(heatRowsHeight())
    expect(bars[0].className.split(' ')).toEqual(expect.arrayContaining(['h-0', 'w-full']))
  })

  it('leaves room for the line that names the busiest hour: 16 px, 16 px under the body', () => {
    const { container } = render(<HeatMapSkeletonBody />)
    const last = container.children[1] as HTMLElement
    expect(last.className.split(' ')).toEqual(expect.arrayContaining(['mt-4', 'h-4']))
    expect(last.querySelectorAll('.skeleton')).toHaveLength(1)
  })
})

describe('the heat map\'s own loading state, and the frame\'s skeleton that no longer holds it', () => {
  it('the new frame\'s skeleton no longer holds it: the frame closes with the bottom (R35), not the heat map', () => {
    // The heat map across the page is today's arrangement's alone since the bottom's round. The frame's skeleton
    // ends with what converts beside the week and three tiles (dashboard-skeleton-shapes.test.tsx).
    const { container } = render(<DashboardFrameSkeleton />)
    expect(container.querySelector('.skeleton.h-0')).toBeNull()
    expect(container.querySelector('.min-h-\\[270px\\]')).toBeNull()
    expect(container.querySelector('[data-skeleton-bottom="tiles"]')).toBeTruthy()
  })

  it('in the frame the heat map loads as that body, so the page does not grow when its week arrives', () => {
    useDailyStats.mockReturnValue(loading)
    const { container } = render(<DashboardFrameProvider><PeakHours siteId="site-1" dateRange={dateRange} /></DashboardFrameProvider>)
    expect(container.querySelector<HTMLElement>('.skeleton.h-0')?.style.paddingBottom).toBe(heatRowsHeight())
    expect(container.querySelector('.mt-4.h-4')).toBeTruthy()
    // The switch is there while it loads, as before.
    expect(screen.getByRole('radiogroup', { name: 'Peak hours metric' })).toBeTruthy()
  })

  it('outside the frame it loads as it always did: seven rows of two bars', () => {
    useDailyStats.mockReturnValue(loading)
    const { container } = render(<PeakHours siteId="site-1" dateRange={dateRange} />)
    expect(container.querySelector('.skeleton.h-0')).toBeNull()
    expect(container.querySelectorAll('.skeleton')).toHaveLength(14)
    expect(container.querySelector('.min-h-\\[270px\\]')?.className).toContain('gap-1.5')
  })
})

describe('the heat map\'s switch on a narrow card', () => {
  const loaded = { data: [], error: undefined, isLoading: false, mutate: vi.fn() }

  it('in the frame scrolls inside its own box, as every block\'s tab row does, and the header is no taller for it', () => {
    useDailyStats.mockReturnValue(loaded)
    render(<DashboardFrameProvider><PeakHours siteId="site-1" dateRange={dateRange} /></DashboardFrameProvider>)
    const box = screen.getByRole('radiogroup', { name: 'Peak hours metric' }).parentElement as HTMLElement
    for (const c of ['min-w-0', 'overflow-x-auto', 'scrollbar-hide', 'pb-1', '-mb-1']) expect(box.className.split(' '), c).toContain(c)
    expect((box.parentElement as HTMLElement).className.split(' ')).toEqual(expect.arrayContaining(['min-w-0', 'flex']))
    expect((box.parentElement as HTMLElement).className).not.toContain('flex-wrap')
  })

  it('outside the frame is as it was: no box of its own (the wrapper lays nothing out)', () => {
    useDailyStats.mockReturnValue(loaded)
    render(<PeakHours siteId="site-1" dateRange={dateRange} />)
    const box = screen.getByRole('radiogroup', { name: 'Peak hours metric' }).parentElement as HTMLElement
    expect(box.className).toBe('contents')
    expect((box.parentElement as HTMLElement).className).toBe('flex items-center gap-1 flex-wrap')
  })
})
