import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import fs from 'node:fs'
import path from 'node:path'
import ContentStats from '@/components/dashboard/ContentStats'
import type { TopPage } from '@/lib/api/stats'

// ---------------------------------------------------------------------------
// Every click-to-filter row on the dashboard was a bare <div onClick>: no
// role, no tab stop, no key handler. Keyboard-only and screen-reader users
// could not filter anything, anywhere in the product — and it was provably
// unintentional, because globals.css already defines a focus-visible ring for
// `.interactive-row` that could never fire on an element that cannot hold
// focus.
//
// Two guards, because one alone is not enough:
//   * a SOURCE SCAN over all six cards, so a new row cannot regress to a bare
//     div without failing (13 rows are too many to pin one render at a time);
//   * a BEHAVIOURAL test of the one row that had to keep its own key handler,
//     because it contains a real link and so cannot be a <button>.
// ---------------------------------------------------------------------------

const ROOT = path.resolve(__dirname, '../../..')
const CARDS = [
  'components/dashboard/Sources.tsx',
  'components/dashboard/GoalStats.tsx',
  'components/dashboard/Locations.tsx',
  'components/dashboard/TechSpecs.tsx',
  'components/dashboard/ContentStats.tsx',
]

/** The opening tag of every element carrying `interactive-row`. */
function interactiveRowTags(src: string): { file: string; tag: string; body: string }[] {
  const out: { file: string; tag: string; body: string }[] = []
  const lines = src.split('\n')
  lines.forEach((line, i) => {
    if (!line.includes('interactive-row')) return
    // Walk back to the element's opening tag, collecting its props.
    let j = i
    while (j >= 0 && !/^\s*<[A-Za-z]/.test(lines[j])) j--
    if (j < 0) return
    const tag = (lines[j].match(/^\s*<([A-Za-z]+)/) ?? [])[1] ?? '?'
    out.push({ file: '', tag, body: lines.slice(j, i + 1).join('\n') })
  })
  return out
}

describe('dashboard filter rows are reachable without a mouse', () => {
  it('no interactive row is a bare <div onClick>', () => {
    const offenders: string[] = []
    for (const file of CARDS) {
      const src = fs.readFileSync(path.join(ROOT, file), 'utf8')
      for (const row of interactiveRowTags(src)) {
        const clickable = /onClick[:=]/.test(row.body)
        if (!clickable) continue
        const isControl = row.tag === 'Row' || row.tag === 'button'
        // A row that cannot be a <button> (it holds a link) must carry the
        // semantics by hand instead — role AND a tab stop AND a key handler.
        const hasAriaSemantics =
          /role: 'button'/.test(row.body) && /tabIndex/.test(row.body) && /onKeyDown/.test(row.body)
        if (!isControl && !hasAriaSemantics) {
          offenders.push(`${file}: <${row.tag}> with a click handler and no keyboard route`)
        }
      }
    }
    expect(offenders, offenders.join(' · ')).toEqual([])
  })

  it('a row rendered as a control declares type="button"', () => {
    // Without it a row inside a <form> ancestor would submit the form.
    const missing: string[] = []
    for (const file of CARDS) {
      const src = fs.readFileSync(path.join(ROOT, file), 'utf8')
      for (const row of interactiveRowTags(src)) {
        if (row.tag !== 'Row' && row.tag !== 'button') continue
        if (!/type: 'button'|type="button"/.test(row.body)) missing.push(`${file}: <${row.tag}>`)
      }
    }
    expect(missing, missing.join(' · ')).toEqual([])
  })

  it('the conditional tag keeps a non-filtering row inert', () => {
    // `Row` resolves to a plain div when the card cannot filter, so a
    // read-only dashboard gains no empty tab stops.
    const src = fs.readFileSync(path.join(ROOT, 'components/dashboard/Sources.tsx'), 'utf8')
    expect(src).toMatch(/const Row = onFilter \? 'button' : 'div'/)
  })
})

// --- the row that cannot be a button ---------------------------------------

const useFullDimensionList = vi.fn()
vi.mock('@/lib/swr/dashboard', () => ({
  useFullDimensionList: (...args: unknown[]) => useFullDimensionList(...args),
}))
vi.mock('@/components/dashboard/VirtualList', () => ({
  default: ({ items, renderItem }: { items: unknown[]; renderItem: (item: never, i: number) => React.ReactNode }) => (
    <div>{items.map((item, i) => renderItem(item as never, i))}</div>
  ),
}))

const idle = { data: undefined, error: undefined, isLoading: false, mutate: vi.fn() }
const page = (p: string, pv: number): TopPage => ({ path: p, pageviews: pv, visitors: pv, bounce_rate: null, avg_duration: null })

beforeEach(() => {
  useFullDimensionList.mockReset().mockReturnValue(idle)
})

describe('the pages row keeps its link and still works from the keyboard', () => {
  const props = {
    topPages: [page('/pricing', 40)],
    entryPages: [] as TopPage[],
    exitPages: [] as TopPage[],
    domain: 'ciphera.net',
    siteId: 'site-1',
    dateRange: { start: '2026-07-20', end: '2026-08-18' },
    totals: { pageviews: 100, visitors: 80 },
  }

  it('is operable by Enter and by Space, and Space does not scroll', () => {
    const onFilter = vi.fn()
    render(<ContentStats {...props} onFilter={onFilter} />)
    const row = screen.getAllByRole('button', { name: /pricing/i })[0]
    expect(row.getAttribute('tabindex')).toBe('0')

    fireEvent.keyDown(row, { key: 'Enter' })
    expect(onFilter).toHaveBeenCalledWith({ dimension: 'page', operator: 'is', values: ['/pricing'] })

    onFilter.mockClear()
    const spaceEvent = createEvent(row, ' ')
    expect(onFilter).toHaveBeenCalledTimes(1)
    expect(spaceEvent.defaultPrevented, 'Space must not scroll the page').toBe(true)
  })

  it('ignores keys that are not activation keys', () => {
    const onFilter = vi.fn()
    render(<ContentStats {...props} onFilter={onFilter} />)
    const row = screen.getAllByRole('button', { name: /pricing/i })[0]
    fireEvent.keyDown(row, { key: 'a' })
    fireEvent.keyDown(row, { key: 'Tab' })
    expect(onFilter).not.toHaveBeenCalled()
  })

  it('still contains a real link to the page, not a nested control', () => {
    render(<ContentStats {...props} onFilter={vi.fn()} />)
    const link = screen.getByRole('link', { name: '' })
    expect(link.getAttribute('href')).toBe('https://ciphera.net/pricing')
    // The row is NOT a <button>, so the link is not nested inside one.
    expect(link.closest('button')).toBeNull()
  })

  it('is not a tab stop when the card cannot filter', () => {
    render(<ContentStats {...props} />)
    expect(screen.queryAllByRole('button', { name: /pricing/i })).toEqual([])
  })
})

/** fireEvent.keyDown returns whether the default was prevented. */
function createEvent(el: Element, key: string) {
  const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  el.dispatchEvent(ev)
  return ev
}
