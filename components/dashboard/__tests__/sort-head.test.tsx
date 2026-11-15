import React, { useState } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SortHead, centredShifts, nextSort, sortRows, type Sort, type SortColumn } from '@/components/dashboard/SortHead'

// ---------------------------------------------------------------------------
// Sorting a block's rows by its column names, high to low and low to high (R41, R51; components/dashboard/
// SortHead.tsx), and where each name sits over its numbers. jsdom lays nothing out, so the centring is pinned on
// its pure computation, fed the measurements a page would give it (the ones of plan §10ad's "After the picks").
// ---------------------------------------------------------------------------

const rows = [
  { name: 'a', visitors: 50, views: 60 },
  { name: 'b', visitors: 40, views: 200 },
  { name: 'c', visitors: 30, views: 30 },
  { name: 'd', visitors: 30, views: 30 },
]
const by = (row: (typeof rows)[number], key: 'visitors' | 'views') => row[key]
const names = (list: typeof rows) => list.map((r) => r.name)

describe('sortRows', () => {
  it('orders high to low and low to high by the asked column', () => {
    expect(names(sortRows(rows, { key: 'views', dir: 'desc' }, by))).toEqual(['b', 'a', 'c', 'd'])
    expect(names(sortRows(rows, { key: 'views', dir: 'asc' }, by))).toEqual(['c', 'd', 'a', 'b'])
    expect(names(sortRows(rows, { key: 'visitors', dir: 'asc' }, by))).toEqual(['c', 'd', 'b', 'a'])
  })

  it('keeps tied rows in the order they came in, in BOTH directions: a sort never shuffles equal rows', () => {
    // c and d tie on both columns: the server sent c first, so c stays first whichever way the list runs.
    for (const dir of ['desc', 'asc'] as const) {
      for (const key of ['visitors', 'views'] as const) {
        const sorted = names(sortRows(rows, { key, dir }, by))
        expect(sorted.indexOf('c'), `${key} ${dir}`).toBeLessThan(sorted.indexOf('d'))
      }
    }
  })

  it('leaves the rows it was given as they were', () => {
    const given = [...rows]
    sortRows(given, { key: 'views', dir: 'desc' }, by)
    expect(given).toEqual(rows)
  })
})

describe('nextSort', () => {
  it('a new column starts high to low; a press on the sorted one turns it, and turns it back', () => {
    const start: Sort<'visitors' | 'views'> = { key: 'visitors', dir: 'desc' }
    expect(nextSort(start, 'views')).toEqual({ key: 'views', dir: 'desc' })
    expect(nextSort(start, 'visitors')).toEqual({ key: 'visitors', dir: 'asc' })
    expect(nextSort({ key: 'visitors', dir: 'asc' }, 'visitors')).toEqual({ key: 'visitors', dir: 'desc' })
    expect(nextSort({ key: 'visitors', dir: 'asc' }, 'views')).toEqual({ key: 'views', dir: 'desc' })
  })
})

describe('centredShifts: a name wider than its numbers is centred over them, a narrower one keeps their edge', () => {
  // The conversion column as measured: name and numbers both end at 739.2 px, "conversion" 54 px of ink, "6.0%" 32.
  const conversion = { key: 'conversion', right: 739.2, width: 74, ink: 54 }

  it('moves "conversion" right by half the difference, so its middle meets the numbers\' middle', () => {
    const shifts = centredShifts([conversion], [{ right: 739.2, width: 74, ink: 32 }, { right: 739.2, width: 74, ink: 28.5 }])
    expect(shifts.conversion).toBe(11)
    // The middles meet: the name's middle, moved, is the widest number's middle.
    expect(conversion.right - conversion.ink / 2 + shifts.conversion).toBeCloseTo(739.2 - 32 / 2, 5)
  })

  it('leaves a name as wide as its numbers, or narrower, ending where they end', () => {
    const shifts = centredShifts(
      [{ key: 'visitors', right: 500, width: 56, ink: 37 }, { key: 'events', right: 568, width: 56, ink: 33 }],
      [{ right: 500, width: 56, ink: 37 }, { right: 568, width: 56, ink: 40 }],
    )
    expect(shifts).toEqual({ visitors: 0, events: 0 })
  })

  it('counts the WIDEST number of the column', () => {
    expect(centredShifts([conversion], [{ right: 739.2, width: 74, ink: 20 }, { right: 739.2, width: 74, ink: 40 }]).conversion).toBe(7)
  })

  it('finds a column\'s numbers by the edge they share with its name, within a pixel, and no further', () => {
    const near = { right: 740.1, width: 74, ink: 32 }
    const far = { right: 741.3, width: 74, ink: 10 }
    expect(centredShifts([conversion], [near]).conversion).toBe(11)
    // A number of another column (another edge) counts for nothing, however narrow it is.
    expect(centredShifts([conversion], [far]).conversion).toBe(0)
    expect(centredShifts([conversion], [near, far]).conversion).toBe(11)
  })

  it('a column hidden on a narrow block has no shift, and a hidden number counts for nothing', () => {
    expect(centredShifts([{ ...conversion, width: 0 }], [{ right: 739.2, width: 74, ink: 32 }])).toEqual({})
    expect(centredShifts([conversion], [{ right: 739.2, width: 0, ink: 0 }]).conversion).toBe(0)
  })

  it('no numbers, no shift: a name is never moved over nothing', () => {
    expect(centredShifts([conversion], [])).toEqual({ conversion: 0 })
  })

  it('rounds the shift to a quarter of a pixel', () => {
    expect(centredShifts([{ ...conversion, ink: 54.3 }], [{ right: 739.2, width: 74, ink: 32 }]).conversion).toBe(11.25)
    expect(centredShifts([{ ...conversion, ink: 54.1 }], [{ right: 739.2, width: 74, ink: 32 }]).conversion).toBe(11)
  })
})

describe('SortHead', () => {
  type Key = 'visitors' | 'events' | 'conversion'
  const columns: SortColumn<Key>[] = [
    { key: 'visitors', label: 'visitors', className: 'w-14 shrink-0 text-right' },
    { key: 'events', label: 'events', className: 'w-14 shrink-0 text-right hidden sm:inline-flex' },
    { key: 'conversion', label: 'conversion', className: 'w-[74px] shrink-0 text-right' },
  ]
  function Head({ onSort }: { onSort?: (s: Sort<Key>) => void }) {
    const [sort, setSort] = useState<Sort<Key>>({ key: 'visitors', dir: 'desc' })
    return (
      <div data-tour-card="x">
        <SortHead columns={columns} sort={sort} onSort={(s) => { setSort(s); onSort?.(s) }} className="gap-3" />
      </div>
    )
  }
  const button = (key: Key) => document.querySelector(`[data-sort="${key}"]`) as HTMLElement

  it('names each column as a control that says what a press does, with the column\'s own widths', () => {
    render(<Head />)
    expect(screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([
      'Sort by visitors, low to high',
      'Sort by events, high to low',
      'Sort by conversion, high to low',
    ])
    for (const c of columns) for (const cls of c.className.split(' ')) expect(button(c.key).classList.contains(cls), `${c.key} ${cls}`).toBe(true)
    // The labels' size and colour, as the plain labels they replace.
    const head = document.querySelector('[data-sort-head]') as HTMLElement
    for (const cls of ['inline-flex', 'text-[11px]', 'text-neutral-500', 'gap-3']) expect(head.classList.contains(cls), cls).toBe(true)
    expect(head.textContent).toBe('visitorseventsconversion')
  })

  it('marks the sorted column with its direction and its arrow, the others with a faint arrow under the pointer only', () => {
    render(<Head />)
    expect(button('visitors').getAttribute('data-dir')).toBe('desc')
    expect(button('visitors').classList.contains('text-neutral-300')).toBe(true)
    expect(button('visitors').querySelector('svg')?.getAttribute('class')).toContain('opacity-100')
    expect(button('events').hasAttribute('data-dir')).toBe(false)
    expect(button('events').querySelector('svg')?.getAttribute('class')).toContain('opacity-0')
    expect(button('events').querySelector('svg')?.getAttribute('class')).toContain('group-hover/sort:opacity-60')
  })

  it('a press sorts high to low, a second press low to high, and another column starts high to low again', () => {
    const onSort = vi.fn()
    render(<Head onSort={onSort} />)
    fireEvent.click(button('events'))
    expect(onSort).toHaveBeenLastCalledWith({ key: 'events', dir: 'desc' })
    expect(button('events').getAttribute('aria-label')).toBe('Sort by events, low to high')
    fireEvent.click(button('events'))
    expect(onSort).toHaveBeenLastCalledWith({ key: 'events', dir: 'asc' })
    expect(button('events').getAttribute('data-dir')).toBe('asc')
    expect(button('events').getAttribute('aria-label')).toBe('Sort by events, high to low')
    fireEvent.click(button('conversion'))
    expect(onSort).toHaveBeenLastCalledWith({ key: 'conversion', dir: 'desc' })
    expect(button('events').hasAttribute('data-dir')).toBe(false)
  })

  it('moves no name on a page that measures nothing', () => {
    render(<Head />)
    for (const c of columns) {
      expect(button(c.key).hasAttribute('data-shift')).toBe(false)
      expect((button(c.key).firstElementChild as HTMLElement).style.transform).toBe('')
    }
  })
})
