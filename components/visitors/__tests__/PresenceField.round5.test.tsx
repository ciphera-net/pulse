import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { PresenceField } from '../PresenceField'
import type { VisitorRow } from '@/lib/api/visitors'

// ─── Round 5 / 5b, the approved field ───────────────────────────────────
//
// Owner decisions, 10-09-2026: §1 B (100 dots, the honesty note live, the month
// boundary drawn) and §3 B (no labels; hovering or focusing a roster row lights
// that visitor's dot and grows it).
//
// Record: Pulse/docs/plans/30-08-2026-visitors-surface-design.md, round 5.

const FROM = Date.parse('2026-08-12T00:00:00Z')
const TO = Date.parse('2026-09-10T23:59:59Z')

function v(i: number, over: Partial<VisitorRow> = {}): VisitorRow {
  return {
    visitor_key: String(i).padStart(32, 'a'),
    month: '2026-09',
    first_seen: '2026-09-01T10:00:00Z',
    last_seen: '2026-09-09T10:00:00Z',
    visits: 3, pageviews: 7, events: 0,
    country: 'NL', region: null, city: 'Amsterdam', device_type: 'mobile',
    browser: 'Safari', os: 'iOS', language: 'nl', screen_resolution: '390x844',
    referrer: 'https://google.com/', entry_path: '/', active_now: false,
    ...over,
  }
}

const field = (props: Partial<Parameters<typeof PresenceField>[0]> = {}) =>
  render(
    <PresenceField
      visitors={[v(1), v(2), v(3)]}
      from={FROM}
      to={TO}
      ticks={[{ at: FROM, label: '12/08' }]}
      activeCount={0}
      undrawn={0}
      caption="Each dot is one visitor · nearer the right, more recently seen"
      emptyLabel="No visitors in this range"
      {...props}
    />,
  )

/** The positioned dot wrappers, by their own data hook. */
const dots = (c: HTMLElement) => [...c.querySelectorAll<HTMLElement>('[data-visitor-dot]')]

describe('the field draws the range, and says what it is not drawing', () => {
  it('🔴 puts the undrawn count in the CAPTION, not on the date axis', () => {
    // The note used to be `absolute bottom-2 left-1/2 -translate-x-1/2` while the
    // date labels are `inset-x-3 bottom-2 justify-between` — the same line, so it
    // landed on the middle date. Nobody had seen it, because `hidden` was
    // `max(0, ≤100 − 200)` and could never be anything but zero: the dead code
    // was hiding a layout bug as well as a lie.
    const { container } = field({ undrawn: 417 })
    expect(container.textContent).toMatch(/417 more not drawn/)

    const note = [...container.querySelectorAll('span')].find((n) =>
      (n.textContent ?? '').includes('417 more not drawn'))!
    const axis = [...container.querySelectorAll('div')].find((d) =>
      d.className.includes('bottom-2') && d.className.includes('justify-between'))!
    expect(note.closest('div')).not.toBe(axis)
    expect(note.closest('p')?.className).toContain('top-2.5')
  })

  it('takes the count from the CALLER — the field cannot know it', () => {
    // It is handed a bounded page on purpose, so it has no idea what the range
    // total is. Deriving the number from its own array is the original bug.
    expect(field({ undrawn: 0 }).container.textContent).not.toMatch(/more not drawn/)
    expect(field({ undrawn: 1 }).container.textContent).toMatch(/1 more not drawn/)
  })

  it('names the undrawn in its text equivalent too', () => {
    expect(field({ undrawn: 417 }).container.textContent).toMatch(/417 more are not drawn/)
  })
})

describe('no labels, and a dot lit from the roster', () => {
  it('🔴 draws NO pseudonyms — that is what removed the displacement bug', () => {
    // A label used to live inside the dot's positioned box, pushing the dot off
    // its own recency x; one ended up outside the panel entirely. With no labels
    // there is nothing to displace and nothing to clip.
    const { container } = field()
    expect(container.textContent).not.toMatch(/Reader|Bookbinder|Lamplighter|Cartographer/)
    for (const d of dots(container)) {
      expect(d.textContent, 'a dot must contain no text').toBe('')
    }
  })

  it('lights exactly the highlighted dot, and grows it', () => {
    const key = v(2).visitor_key
    const { container } = field({ highlightKey: key })
    const marks = dots(container).map((d) => d.querySelector('span')!)
    const lit = marks.filter((m) => m.className.includes('bg-brand-orange'))
    expect(lit).toHaveLength(1)
    expect(lit[0].getAttribute('title')).toBeTruthy()

    // 4px larger than the same dot unlit — size is transient emphasis here, and
    // colour alone is not enough at the right-hand edge where the active dots
    // are already orange.
    const cold = dots(field().container).map((d) => d.querySelector('span')!)
    const idx = marks.indexOf(lit[0])
    const w = (m: Element) => parseFloat((m as HTMLElement).style.width)
    expect(w(marks[idx]) - w(cold[idx])).toBe(4)
  })

  it('lights nothing when nothing is hovered, and an active dot is not a highlight', () => {
    const { container } = field({ highlightKey: null, visitors: [v(1, { active_now: true }), v(2)] })
    const marks = dots(container).map((d) => d.querySelector('span')!)
    // The active-now dot keeps its own orange — but it is not GROWN, which is
    // what distinguishes "on the site now" from "this is the row you are on".
    const orange = marks.filter((m) => m.className.includes('bg-brand-orange'))
    expect(orange).toHaveLength(1)
    const sizes = marks.map((m) => parseFloat((m as HTMLElement).style.width))
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThan(4)
  })
})

describe('no identity boundary (one-day identity)', () => {
  // Every profile covers up to one day and every day counts visitors per day, so
  // the field draws no "identities reset" marker: there is nothing to mark. The
  // dashed now-line is the only line besides the gridlines.
  it('draws no reset marker, whatever the range', () => {
    // FROM..TO spans 1 September, where the old field drew its month marker.
    const { container } = field({})
    expect(container.textContent).not.toMatch(/identities reset/)
    // The one dashed line left is the now-line at the right edge.
    expect(container.querySelectorAll('.border-dashed')).toHaveLength(1)
  })

  it('the page no longer computes month boundaries', async () => {
    const range = await import('@/lib/visitors/range')
    expect('monthBoundaries' in range).toBe(false)
  })
})
