import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { dirname, join, normalize } from 'path'

vi.mock('@/lib/skeleton/band', () => ({ registerBar: () => () => undefined }))

import { DashboardSkeleton } from '@/components/skeletons'
import { DashboardFrameSkeleton } from '@/components/skeleton/DashboardFrameSkeleton'
import { FRAME_CARD } from '@/lib/dashboard/frame'

// The dashboard's skeleton is the new frame's shape for every reader since 15-11-2026 (the dashboard went to every
// team, and public pages draw the frame too). Until then a member's page drew two shapes and the stylesheet showed
// one; that choice and today's shape are gone.

describe('DashboardSkeleton', () => {
  it('draws the frame\'s shape alone, for every reader, with no shape class left to hide it', () => {
    const { container } = render(<DashboardSkeleton />)
    expect(container.children).toHaveLength(1)
    const root = container.firstElementChild as HTMLElement
    expect(root.outerHTML).toBe(render(<DashboardFrameSkeleton />).container.firstElementChild?.outerHTML)
    expect(root.className).not.toContain('skeleton-old-shape')
    expect(root.className).not.toContain('skeleton-new-shape')
    // The page's width limit and gutters, so the skeleton sits where the page will.
    for (const c of ['w-full', 'max-w-7xl', 'mx-auto', 'px-4', 'sm:px-6', 'pb-8']) expect(root.className.split(' '), c).toContain(c)
  })

  it('the stylesheet no longer hides a shape', () => {
    const css = readFileSync(join(process.cwd(), 'styles/globals.css'), 'utf8')
    expect(css).not.toMatch(/skeleton-(new|old)-shape/)
  })
})

describe('the new frame\'s shape', () => {
  const frame = () => render(<DashboardFrameSkeleton />).container.firstElementChild as HTMLElement

  it('holds five blocks of the frame\'s one height, each with seven row slots, the last across both columns', () => {
    // The frame's own grid: Sources and Pages, Locations and Technology, then Events alone. A sixth block here
    // (Outbound had one until its links became the Pages block's tab) would make the skeleton a block taller than
    // the page on a phone, and draw two half blocks where one whole one lands.
    // The first grid of the column alone: the bottom has two grids of its own under it.
    const blocks = [...(frame().querySelector('.flex.flex-col.gap-3') as HTMLElement).children[1].children] as HTMLElement[]
    expect(blocks).toHaveLength(5)
    expect(FRAME_CARD).toContain('h-[442px]')
    for (const block of blocks) {
      for (const cls of FRAME_CARD.split(' ')) expect(block.classList.contains(cls), cls).toBe(true)
      expect(block.querySelectorAll('.h-9')).toHaveLength(7)
    }
    expect(blocks.map((b) => b.classList.contains('lg:col-span-2'))).toEqual([false, false, false, false, true])
  })

  it('spans the same block the frame spans: the fifth, Events', () => {
    // The two files must agree, or the last row jumps when the data lands.
    const source = readFileSync(join(process.cwd(), 'components/surfaces/DashboardFrame.tsx'), 'utf8')
    expect(source.match(/lg:col-span-2/g)).toHaveLength(1)
    expect(source).toContain('<div className="lg:col-span-2" data-frame-events="">\n            <ContentSignals\n')
    const blocks = ['<Sources\n', '<ContentStats\n', '<Audience\n', '<TechSpecs\n', '<ContentSignals\n']
    expect(blocks.every((tag) => source.includes(tag))).toBe(true)
    expect(source).not.toContain('<Outbound')
  })

  it('stacks the chart, the blocks and the bottom\'s two rows 12 px apart, as the frame does', () => {
    const column = frame().querySelector('.flex.flex-col.gap-3') as HTMLElement
    expect(column.children).toHaveLength(4)
    // The chart's rail holds five tiles.
    expect(column.children[0].querySelectorAll('.min-h-\\[93px\\]')).toHaveLength(5)
    expect(column.children[1].className).toContain('lg:grid-cols-2')
    expect(column.children[2].getAttribute('data-skeleton-bottom')).toBe('pair')
    expect(column.children[3].getAttribute('data-skeleton-bottom')).toBe('tiles')
  })

  it('closes with the bottom in its own shape (R35): two blocks of the one height, then three tiles of 164 px', () => {
    // components/dashboard/DashboardBottom.tsx draws the same two grids, so nothing moves when the data lands.
    const column = frame().querySelector('.flex.flex-col.gap-3') as HTMLElement
    const pair = column.children[2] as HTMLElement
    expect(pair.className).toBe('grid gap-3 lg:grid-cols-2 [&>*]:min-w-0')
    const [conversion, week] = [...pair.children] as HTMLElement[]
    expect(pair.children).toHaveLength(2)
    for (const block of [conversion, week]) for (const cls of FRAME_CARD.split(' ')) expect(block.classList.contains(cls), cls).toBe(true)
    // What converts: seven row slots, like every block. The week: its figure and line over its grid.
    expect(conversion.querySelectorAll('.h-9')).toHaveLength(7)
    expect(week.querySelectorAll('.h-9')).toHaveLength(0)
    expect(week.querySelector('.min-h-\\[3\\.25rem\\]')?.querySelectorAll('.skeleton')).toHaveLength(2)
    const tiles = column.children[3] as HTMLElement
    expect(tiles.className).toBe('grid gap-3 sm:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0')
    expect(tiles.children).toHaveLength(3)
    for (const tile of [...tiles.children]) expect(tile.classList.contains('h-[164px]')).toBe(true)
    // Performance takes a row of its own under 1,280 px, as its tile does.
    expect([...tiles.children].map((t) => t.className.includes('sm:col-span-2 xl:col-span-1'))).toEqual([false, false, true])
    const source = readFileSync(join(process.cwd(), 'components/dashboard/DashboardBottom.tsx'), 'utf8')
    expect(source).toContain('className="grid gap-3 lg:grid-cols-2 [&>*]:min-w-0"')
    expect(source).toContain('className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0"')
  })

  it('draws the toolbar\'s three controls over them', () => {
    const toolbar = frame().firstElementChild as HTMLElement
    expect(toolbar.querySelectorAll('.skeleton')).toHaveLength(3)
    expect(toolbar.className.split(' ')).toEqual(expect.arrayContaining(['-mt-2.5', 'mb-0.5', 'py-2.5']))
  })

  it('is made of the pieces alone: every gray box in it is a bar', () => {
    const root = frame()
    const bars = root.querySelectorAll('.skeleton')
    // The toolbar's 3, the rail's 15 and the plot's 2, five blocks of 17 (a tab row and a unit, seven rows of a
    // bar and a number, a pager), then the bottom: what converts is a sixth block of 17, the week has 5 (its
    // switch, its figure and line, its grid, its legend) and each of the three tiles 3. A count that falls means a
    // part went missing.
    expect(root.querySelectorAll('.grid.gap-3 > div .skeleton')).toHaveLength(6 * 17 + 5 + 3 * 3)
    expect(bars.length).toBe(3 + 15 + 2 + 6 * 17 + 5 + 3 * 3)
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
  // A bare gray box stays a flat box among the dithered pieces. Every placeholder goes through a piece of
  // components/skeleton/primitives.tsx.
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

describe('the server can draw every skeleton: none of its files reads a value out of a client-only module', () => {
  // The server draws skeletons (the demo's first HTML, a settings page's loading state), so components/skeletons.tsx
  // and what it imports are server files unless they say 'use client'. A server file that imports a VALUE from a
  // client-only module gets a reference it may only pass on, the way a component is handed to React. Reading it,
  // as a class name is read in a template string, throws when the page is asked for. Neither the type check nor a
  // unit test of the component can notice: both load the real module. The frame's class names were such values
  // (lib/dashboard/frame.tsx is client-only), which is why they live in lib/dashboard/frameClasses.ts.
  const root = process.cwd()
  const code = (path: string) => readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'`\\])\/\/[^\n]*/g, '$1')
  const clientOnly = (path: string) => /^\s*['"]use client['"]/.test(code(path))
  const resolve = (spec: string, from: string): string | null => {
    const base = spec.startsWith('@/') ? join(root, spec.slice(2)) : spec.startsWith('.') ? normalize(join(dirname(from), spec)) : null
    if (!base) return null
    return [base, `${base}.tsx`, `${base}.ts`, join(base, 'index.tsx'), join(base, 'index.ts')].find((p) => existsSync(p) && statSync(p).isFile()) ?? null
  }
  const IMPORT = /^\s*import\s+(type\s+)?([^;'"]*?)\s+from\s+['"]([^'"]+)['"]/gm
  /** A component is passed on, never read: the one kind of value a server file may take from a client-only module. */
  const isComponent = (name: string) => /^[A-Z][A-Za-z0-9]*$/.test(name) && !/^[A-Z0-9_]+$/.test(name)

  const walked: string[] = []
  const taken: string[] = []
  const queue = [join(root, 'components/skeletons.tsx')]
  while (queue.length) {
    const file = queue.pop() as string
    if (walked.includes(file)) continue
    walked.push(file)
    for (const [, typeOnly, clause, spec] of code(file).matchAll(IMPORT)) {
      const target = typeOnly ? null : resolve(spec, file)
      if (!target) continue
      if (!clientOnly(target)) { queue.push(target); continue }
      const named = (clause.match(/\{([^}]*)\}/)?.[1] ?? '').split(',').map((n) => n.trim()).filter((n) => n && !n.startsWith('type ')).map((n) => n.split(' as ').pop() as string)
      const whole = clause.split('{')[0].replace(',', '').trim()
      for (const name of whole ? [whole, ...named] : named) {
        if (!isComponent(name)) taken.push(`${file.slice(root.length + 1)} takes ${name} from ${target.slice(root.length + 1)}`)
      }
    }
  }
  const rel = walked.map((file) => file.slice(root.length + 1))

  it('walks the files the server draws a skeleton from', () => {
    for (const file of ['components/skeletons.tsx', 'components/skeleton/DashboardFrameSkeleton.tsx', 'lib/dashboard/frameClasses.ts']) {
      expect(rel, file).toContain(file)
    }
    // The module they are client-only for is the boundary, and is not walked into.
    expect(rel).not.toContain('components/skeleton/primitives.tsx')
    expect(clientOnly(join(root, 'components/skeleton/primitives.tsx'))).toBe(true)
    expect(clientOnly(join(root, 'lib/dashboard/frame.tsx'))).toBe(true)
  })

  it('none of them is client-only, and none takes anything but a component from a module that is', () => {
    expect(taken).toEqual([])
  })

  it('the frame passes the same strings on to its blocks: one definition, read from two sides', async () => {
    const plain = await import('@/lib/dashboard/frameClasses')
    const frame = await import('@/lib/dashboard/frame')
    for (const name of ['FRAME_SURFACE', 'FRAME_CARD', 'FRAME_CARD_BODY', 'FRAME_CARD_NAME', 'FRAME_CARD_NOTE'] as const) {
      expect(frame[name], name).toBe(plain[name])
      expect(typeof plain[name]).toBe('string')
    }
  })
})
