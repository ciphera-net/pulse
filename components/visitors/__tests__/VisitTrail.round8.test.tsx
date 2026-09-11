import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { VisitTrail } from '../VisitTrail'
import type { VisitEvent, VisitEventsResponse } from '@/lib/api/visitors'

/**
 * Round 8 (owner, 11-09-2026: "make these steps a bit bigger & maybe more
 * integrated in the block" — decided "1A, 2B", i.e. option B as mocked):
 *
 *   A · the size step — path text-base/medium/foreground, dwell text-sm,
 *       sentence text-base/neutral-300, glyph 16px, chips text-sm, rows gap-2,
 *       wrapper mt-1.5/gap-1.5, node mt-2.5;
 *   B · a 1px tick from the rail to every event step, the rail one shade up so
 *       the ticks hang off something.
 *
 * The mock edited the LIVE nodes' classes in place, so the class lists in
 * docs/data/11-09-2026-visitors-round8-mocks/harness-visitors-round8-mocks.spec.ts
 * are the pixel spec, and these tests pin exactly those classes. jsdom has no
 * layout, so the geometry (the rail at 0.00px off its node, the tick spanning
 * 19.5 → 30.5px) is measured in the browser harness, not here.
 */

const hook = vi.fn()
vi.mock('@/lib/swr/dashboard', () => ({
  useVisitEvents: (...args: unknown[]) => hook(...args),
}))

function ev(
  name: string,
  path: string | null,
  ts: string,
  properties?: Record<string, string>,
  duration: number | null = null,
): VisitEvent {
  return { timestamp: ts, type: name === 'pageview' ? 'pageview' : 'custom', event_name: name, path, properties, duration, scroll_depth: null }
}

const T = (ms: number) => new Date(Date.UTC(2026, 8, 11, 11, 22, 30, ms)).toISOString()

/** One page carrying every kind the trail can mark, plus a customer's own event. */
const TRAIL: VisitEvent[] = [
  ev('pageview', '/pricing', T(0), undefined, 9),
  ev('pulse_click', '/pricing', T(400), { text: 'Explore Products', tag: 'a', page_path: '/pricing' }),
  ev('pulse_copy', '/pricing', T(800), { chars: '29', source_tag: 'p', page_path: '/pricing' }),
  ev('pulse_form_submit', '/pricing', T(1200), { fields: '5', page_path: '/pricing' }),
  ev('outbound_link', '/pricing', T(1600), { url: 'https://stripe.com/pricing', page_path: '/pricing' }),
  ev('file_download', '/pricing', T(2000), { url: 'https://ciphera.net/files/p.pdf', page_path: '/pricing' }),
  ev('header_cta_get_started', '/pricing', T(2400), { step: '2' }),
]
const EVENT_STEPS = TRAIL.length - 1

function payload(events: VisitEvent[]): VisitEventsResponse {
  return { events, total: events.length, page: 1, page_size: 200, site_timezone: 'Europe/Brussels' }
}

function renderTrail() {
  return render(
    <VisitTrail
      siteId="site-1"
      visitorKey={'a'.repeat(32)}
      visitKey={`${'b'.repeat(32)}:1`}
      range={{ startDate: '2026-09-01', endDate: '2026-09-11' }}
    />,
  )
}

// The selectors, named once. A class with a dot or brackets needs escaping
// inside querySelector, which is why these are constants and not inline.
const ROW = 'div.relative.pl-4'
const EVENTS = 'div.mt-1\\.5'
const EVENT_ROW = `${EVENTS} > div`
const TICK = 'span.w-\\[11px\\]'
const SENTENCE = `${EVENT_ROW} > span.truncate:not(.font-mono)`

beforeEach(() => {
  hook.mockReset()
  hook.mockReturnValue({ data: payload(TRAIL), error: undefined, isLoading: false })
})

describe('VisitTrail round 8 — the size step (option A)', () => {
  it('sets a page path in text-base, medium, in the foreground ink', () => {
    const { container } = renderTrail()
    const head = container.querySelector(`${ROW} > div.min-w-0 > div.flex.items-baseline`)!
    const path = head.firstElementChild as HTMLElement
    expect(path.textContent).toBe('/pricing')
    for (const c of ['text-base', 'font-medium', 'text-foreground']) expect(path.className, c).toContain(c)
    expect(path.className).not.toContain('text-sm')
    expect(path.className).not.toContain('text-neutral-300')
  })

  it('sets the dwell one size up, in text-sm', () => {
    const { container } = renderTrail()
    const dwell = container.querySelector(`${ROW} span.tabular-nums`) as HTMLElement
    expect(dwell.textContent).toBe('9s')
    expect(dwell.className).toContain('text-sm')
    expect(dwell.className).not.toContain('text-xs')
  })

  it('sets every sentence in text-base and neutral-300 — never text-sm, never neutral-400', () => {
    const { container } = renderTrail()
    const sentences = [...container.querySelectorAll(SENTENCE)] as HTMLElement[]
    // Five of our own types earn a sentence; the customer's event keeps its chip.
    expect(sentences).toHaveLength(5)
    for (const s of sentences) {
      expect(s.className, s.textContent ?? '').toContain('text-base')
      expect(s.className, s.textContent ?? '').toContain('text-neutral-300')
      expect(s.className).not.toContain('text-sm')
      expect(s.className).not.toContain('text-neutral-400')
    }
  })

  it('draws every step glyph at 16px', () => {
    const { container } = renderTrail()
    const glyphs = [...container.querySelectorAll(`${EVENTS} svg`)]
    expect(glyphs).toHaveLength(EVENT_STEPS)
    for (const g of glyphs) {
      expect(g.getAttribute('width')).toBe('16')
      expect(g.getAttribute('height')).toBe('16')
    }
  })

  it('steps the chips up to text-sm, so a customer event is not smaller than our sentences', () => {
    const { container } = renderTrail()
    const chips = [...container.querySelectorAll(`${EVENTS} span.font-mono`)] as HTMLElement[]
    // the name chip + its one property chip
    expect(chips.map((c) => c.textContent)).toEqual(['header_cta_get_started', 'step: 2'])
    for (const c of chips) {
      expect(c.className).toContain('text-sm')
      expect(c.className).not.toContain('text-xs')
    }
  })

  it('spaces the steps: wrapper mt-1.5 / gap-1.5, rows gap-2, node mt-2.5', () => {
    const { container } = renderTrail()
    // classList, not a regex: `\b` treats the dot in `gap-1.5` as a word
    // boundary, so /\bgap-1\b/ matches the very class it is meant to exclude.
    const wrapper = container.querySelector(EVENTS) as HTMLElement
    expect(wrapper.classList.contains('gap-1.5')).toBe(true)
    expect(wrapper.classList.contains('gap-1')).toBe(false)
    const rows = [...container.querySelectorAll(EVENT_ROW)] as HTMLElement[]
    expect(rows).toHaveLength(EVENT_STEPS)
    for (const r of rows) {
      expect(r.classList.contains('gap-2')).toBe(true)
      expect(r.classList.contains('gap-1.5')).toBe(false)
    }
    const dot = container.querySelector(`${ROW} > span.rounded-full`) as HTMLElement
    expect(dot.classList.contains('mt-2.5')).toBe(true)
    expect(dot.classList.contains('mt-2')).toBe(false)
  })
})

describe('VisitTrail round 8 — the branches (option B)', () => {
  it('draws exactly one tick per event step, and none on the page row', () => {
    const { container } = renderTrail()
    const ticks = container.querySelectorAll(TICK)
    expect(ticks).toHaveLength(EVENT_STEPS)
    // Every tick is the FIRST child of its own step row, so it hangs off that
    // row's left edge and nothing else's.
    for (const row of container.querySelectorAll(EVENT_ROW)) {
      expect(row.firstElementChild?.matches(TICK), 'a step row starts with its tick').toBe(true)
    }
    const pageHead = container.querySelector(`${ROW} > div.min-w-0 > div.flex.items-baseline`)!
    expect(pageHead.querySelector(TICK)).toBeNull()
  })

  it('hides every tick from assistive tech — it is the rail’s decoration, exactly like the rail', () => {
    const { container } = renderTrail()
    for (const t of container.querySelectorAll(TICK)) {
      expect(t.getAttribute('aria-hidden')).toBe('true')
    }
  })

  /**
   * The geometry, as classes. The content column starts at pl-4 (16) + the
   * 7px node + gap-3 (12) = 35px; the rail's centre is 19.5px; so the tick is
   * 15.5px to the left of the column and 11px wide (19.5 → 30.5), at the row's
   * vertical centre. The browser harness measures the pixels; this pins the
   * classes that produce them, and that each row is the tick's positioning box.
   */
  it('places each tick on the rail: -left-[15.5px], 11px wide, centred, in the rail’s shade', () => {
    const { container } = renderTrail()
    for (const t of container.querySelectorAll(TICK)) {
      for (const c of ['absolute', '-left-[15.5px]', 'top-1/2', 'h-px', 'w-[11px]', '-translate-y-1/2', 'bg-neutral-700']) {
        expect(t.className, c).toContain(c)
      }
      expect(t.parentElement?.className, 'the step row is the tick’s positioning box').toContain('relative')
    }
  })

  it('moves the rail from `border` to the ticks’ shade, so they hang off something', () => {
    hook.mockReturnValue({
      data: payload([...TRAIL, ev('pageview', '/docs', T(3000), undefined, 4)]),
      error: undefined,
      isLoading: false,
    })
    const { container } = renderTrail()
    const rails = [...container.querySelectorAll(`${ROW} > span.absolute`)] as HTMLElement[]
    expect(rails.length).toBeGreaterThan(0)
    for (const r of rails) {
      expect(r.className).toContain('bg-neutral-700')
      expect(r.className).not.toContain('bg-border')
      // and round 6's centring survives
      expect(r.className).toContain('left-[19.5px]')
    }
  })

  /**
   * An orphan — an event whose page is filtered away — is a STEP, so it gets
   * the same tick a nested step does, and its sentence the same size. Switching
   * Pages off turns every event into one.
   */
  it('gives an orphan step the same tick and the same size as a nested one', () => {
    const { container } = renderTrail()
    fireEvent.click(screen.getByRole('button', { name: /^Pages/ }))
    expect(screen.queryByText('/pricing')).not.toBeInTheDocument()

    const rows = [...container.querySelectorAll(ROW)]
    expect(rows).toHaveLength(EVENT_STEPS)
    expect(container.querySelectorAll(TICK)).toHaveLength(EVENT_STEPS)
    for (const row of rows) {
      const head = row.querySelector('div.min-w-0 > div.flex.items-baseline') as HTMLElement
      expect(head.className, 'the orphan head is the tick’s positioning box').toContain('relative')
      expect(head.firstElementChild?.matches(TICK)).toBe(true)
      // the orphan's label wrapper takes a step's ink, not a page path's weight
      // (`span.truncate`: the tick is also a direct span child, and comes first)
      const label = head.querySelector(':scope > span.truncate') as HTMLElement
      expect(label.className).toContain('text-base')
      expect(label.className).toContain('text-neutral-300')
      expect(label.className).not.toContain('font-medium')
    }
    for (const s of container.querySelectorAll('span.truncate:not(.font-mono)')) {
      expect((s as HTMLElement).className).not.toContain('text-sm')
    }
  })
})
