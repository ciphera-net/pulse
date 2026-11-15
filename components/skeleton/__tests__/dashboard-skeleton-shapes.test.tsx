import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

vi.mock('@/lib/skeleton/band', () => ({ registerBar: () => () => undefined }))

import { DashboardSkeleton } from '@/components/skeletons'
import { DashboardFrameSkeleton } from '@/components/skeleton/DashboardFrameSkeleton'
import { FRAME_CARD } from '@/lib/dashboard/frame'

// The dashboard's skeleton has two shapes while the new dashboard is a beta. A member's page draws both and the
// stylesheet shows one; a public page is never offered the new dashboard and draws today's alone.

describe('DashboardSkeleton', () => {
  it('by default draws today\'s shape alone, with no shape class: nothing can hide it', () => {
    const { container } = render(<DashboardSkeleton />)
    expect(container.children).toHaveLength(1)
    const root = container.firstElementChild as HTMLElement
    expect(root.className).not.toContain('skeleton-old-shape')
    expect(root.className).not.toContain('skeleton-new-shape')
    expect(container.querySelector('.glass-block')).toBeNull()
  })

  it('for a member draws both shapes, each under the class the stylesheet switches', () => {
    const { container } = render(<DashboardSkeleton shape="both" />)
    expect(container.children).toHaveLength(2)
    const [today, frame] = [...container.children] as HTMLElement[]
    expect(today.className.split(' ')).toContain('skeleton-old-shape')
    expect(frame.className.split(' ')).toContain('skeleton-new-shape')
    // The same page width limit and gutters, so either shape sits where the page will.
    for (const root of [today, frame]) {
      for (const c of ['w-full', 'max-w-7xl', 'mx-auto', 'px-4', 'sm:px-6', 'pb-8']) expect(root.className.split(' '), c).toContain(c)
    }
  })

  it('today\'s shape is unchanged by the second one: the same bars either way', () => {
    const alone = render(<DashboardSkeleton />)
    const both = render(<DashboardSkeleton shape="both" />)
    const bars = (root: Element) => [...root.querySelectorAll('.skeleton')].map((b) => b.className)
    expect(bars(both.container.firstElementChild as Element)).toEqual(bars(alone.container.firstElementChild as Element))
    expect(bars(alone.container.firstElementChild as Element).length).toBeGreaterThan(100)
  })
})

describe('the new frame\'s shape', () => {
  const frame = () => render(<DashboardFrameSkeleton />).container.firstElementChild as HTMLElement

  it('holds six blocks of the frame\'s one size, each with seven row slots', () => {
    const blocks = [...frame().querySelectorAll('.grid.gap-3 > div')].filter((el) => el.className === FRAME_CARD)
    expect(blocks).toHaveLength(6)
    expect(FRAME_CARD).toContain('h-[442px]')
    for (const block of blocks) expect(block.querySelectorAll('.h-9')).toHaveLength(7)
  })

  it('stacks the chart, the blocks and the heat map 12 px apart, as the frame does', () => {
    const column = frame().querySelector('.flex.flex-col.gap-3') as HTMLElement
    expect(column.children).toHaveLength(3)
    // The chart's rail holds five tiles.
    expect(column.children[0].querySelectorAll('.min-h-\\[93px\\]')).toHaveLength(5)
    expect(column.children[1].className).toContain('lg:grid-cols-2')
    // The heat map has no height of its own: its body takes the grid's (heat-map-skeleton.test.tsx).
    expect(column.children[2].className).toContain('glass-block')
    expect(column.children[2].className).not.toMatch(/\bh-\[\d+px\]/)
  })

  it('draws the toolbar\'s three controls over them', () => {
    const toolbar = frame().firstElementChild as HTMLElement
    expect(toolbar.querySelectorAll('.skeleton')).toHaveLength(3)
    expect(toolbar.className.split(' ')).toEqual(expect.arrayContaining(['-mt-2.5', 'mb-0.5', 'py-2.5']))
  })

  it('is made of the pieces alone: every gray box in it is a bar', () => {
    const root = frame()
    const bars = root.querySelectorAll('.skeleton')
    expect(bars.length).toBeGreaterThan(110)
    expect(root.querySelectorAll('.bg-neutral-800:not(.skeleton)')).toHaveLength(0)
  })

  it('no bar of it can be wider than its block on a phone', () => {
    // A fixed width needs a limit beside it wherever the block can be narrower than it.
    const wide = [...frame().querySelectorAll<HTMLElement>('.skeleton')].filter((b) => /w-\[(1[6-9]\d|[2-9]\d\d)px\]/.test(b.className))
    expect(wide.length).toBeGreaterThan(0)
    for (const bar of wide) expect(bar.className, bar.className).toMatch(/max-w-/)
  })
})

describe('no loading placeholder in the app is drawn by hand any more', () => {
  // A bare gray box keeps today's look when everything around it has the new one. Every placeholder goes through
  // a piece of components/skeleton/primitives.tsx.
  const ROOTS = ['app', 'components', 'lib']
  const files: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name)
      if (name === 'node_modules' || name === '__tests__' || name.startsWith('.')) continue
      if (statSync(path).isDirectory()) walk(path)
      else if (path.endsWith('.tsx')) files.push(path)
    }
  }
  ROOTS.forEach((root) => walk(join(process.cwd(), root)))

  // A self-closing div or span whose classes are a gray fill and nothing a real element would have.
  const BARE = /<(div|span)\b[^>]*className="[^"]*\bbg-(input|neutral-800)(\/\d+)?\b[^"]*"[^>]*\/>/g
  // A gray box that is NOT a loading state, each with its reason.
  const ALLOWED: Record<string, string> = {
    'components/search/rowPrimitives.tsx': 'the chip a country row draws when its flag does not exist: it stays for good, so no band may sweep it',
  }

  it('finds the app\'s source', () => {
    expect(files.length).toBeGreaterThan(300)
  })

  it('no bare gray box is left outside the pieces', () => {
    const found: string[] = []
    for (const file of files) {
      const rel = file.slice(process.cwd().length + 1)
      if (rel.startsWith('components/skeleton/')) continue
      for (const match of readFileSync(file, 'utf8').matchAll(BARE)) {
        if (ALLOWED[rel]) continue
        found.push(`${rel}: ${match[0].slice(0, 110)}`)
      }
    }
    expect(found).toEqual([])
  })

  it('every allowed file still holds the box it is allowed for', () => {
    for (const rel of Object.keys(ALLOWED)) {
      expect([...readFileSync(join(process.cwd(), rel), 'utf8').matchAll(BARE)].length, rel).toBe(1)
    }
  })
})
