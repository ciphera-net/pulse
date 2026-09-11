import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { VisitTrail } from '../VisitTrail'
import type { VisitEvent, VisitEventsResponse } from '@/lib/api/visitors'

/**
 * Round 7 (owner, 11-09-2026): the trail describes the three types the companion
 * script records, every step carries one glyph in the BRAND (option B1), and the
 * filter row gets a bucket per type with that same glyph (option E).
 *
 * The sentence and ordering RULES are unit-tested in lib/visitors/__tests__/
 * trail.test.ts, where mutation testing is cheap. These cover only what needs a
 * rendered component.
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
  ev('header_cta_get_started', '/pricing', T(2400)),
]

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

beforeEach(() => {
  hook.mockReset()
  hook.mockReturnValue({ data: payload(TRAIL), error: undefined, isLoading: false })
})

describe('VisitTrail round 7 — the sentences', () => {
  it('describes all five of our captured types in words', () => {
    renderTrail()
    expect(screen.getByText('Clicked the link “Explore Products”')).toBeInTheDocument()
    expect(screen.getByText('Copied 29 characters from a paragraph')).toBeInTheDocument()
    expect(screen.getByText('Submitted a form with 5 fields')).toBeInTheDocument()
    expect(screen.getByText('Left for stripe.com/pricing')).toBeInTheDocument()
    expect(screen.getByText('Downloaded p.pdf')).toBeInTheDocument()
  })

  it('leaves a customer event as its name chip, which is all we can honestly show', () => {
    renderTrail()
    expect(screen.getByText('header_cta_get_started')).toBeInTheDocument()
  })

  /**
   * 🔴 The chips a sentence replaces must actually be GONE. Round 6 shipped this
   * for two types; the same has to hold for the three added here, or the row is
   * a sentence AND the chips it was meant to replace.
   */
  it('shows no property chip beside any described step', () => {
    const { container } = renderTrail()
    const text = container.textContent ?? ''
    for (const chip of ['text:', 'tag:', 'chars:', 'source_tag:', 'fields:', 'page_path:', 'url:']) {
      expect(text, chip).not.toContain(chip)
    }
  })
})

describe('VisitTrail round 7 — the mark (option B1)', () => {
  it('gives every non-page step exactly one glyph', () => {
    const { container } = renderTrail()
    // Six events hang under the one page row; the page row itself has no glyph —
    // the rail's node is its mark.
    const glyphs = container.querySelectorAll('div.mt-1 svg')
    expect(glyphs).toHaveLength(6)
  })

  /**
   * 🔴 THE BRAND, IN ONE INK. Option B1 was chosen over a colour-per-type
   * variant that reads as confetti and breaks the house rule that colour lives
   * in a small dot or a single word. If a future edit reaches for a palette,
   * this is what stops it.
   *
   * MUTATION CHECK: change StepGlyph's class to anything else and this reddens.
   */
  it('draws every step glyph in brand-orange and nothing else', () => {
    const { container } = renderTrail()
    const inks = new Set(
      [...container.querySelectorAll('div.mt-1 svg')].map((g) =>
        [...g.classList].filter((c) => c.startsWith('text-')).join(' '),
      ),
    )
    expect([...inks]).toEqual(['text-brand-orange'])
  })

  it('hides the glyph from assistive tech — the sentence beside it already says the type', () => {
    const { container } = renderTrail()
    for (const g of container.querySelectorAll('div.mt-1 svg')) {
      expect(g.getAttribute('aria-hidden')).toBe('true')
    }
  })
})

describe('VisitTrail round 7 — the filter row (option E)', () => {
  it('gives each type its own bucket instead of one Events bucket', () => {
    renderTrail()
    for (const label of ['Pages', 'Clicks', 'Copies', 'Forms', 'Outbound', 'Downloads', 'Events']) {
      expect(screen.getByRole('button', { name: new RegExp(`^${label}`) }), label).toBeInTheDocument()
    }
  })

  it('counts each bucket over the whole loaded trail', () => {
    renderTrail()
    const counts: Record<string, string> = {}
    for (const b of screen.getAllByRole('button')) {
      const m = (b.textContent ?? '').match(/^([A-Za-z]+)(\d+)$/)
      if (m) counts[m[1]] = m[2]
    }
    expect(counts).toEqual({
      Pages: '1', Clicks: '1', Copies: '1', Forms: '1', Outbound: '1', Downloads: '1', Events: '1',
    })
  })

  /**
   * A kind with no steps in this visit is not rendered at all — an absent kind is
   * not a control. Seven buckets is the maximum, not the default.
   */
  it('renders only the buckets this visit actually has', () => {
    hook.mockReturnValue({
      data: payload([
        ev('pageview', '/a', T(0), undefined, 3),
        ev('pulse_copy', '/a', T(400), { chars: '9', source_tag: 'p', page_path: '/a' }),
      ]),
      error: undefined,
      isLoading: false,
    })
    renderTrail()
    expect(screen.getByRole('button', { name: /^Pages/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Copies/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Clicks/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Forms/ })).toBeNull()
  })

  it('carries the same glyph in the bar as in the trail', () => {
    const { container } = renderTrail()
    // Every chip has exactly one glyph, so the mark means the same thing in both.
    for (const b of container.querySelectorAll('button[aria-pressed]')) {
      expect(b.querySelectorAll('svg')).toHaveLength(1)
    }
  })
})

describe('VisitTrail round 7 — the causal order, rendered', () => {
  /**
   * 🔴 The case the owner reported: the departure was recorded 38.5ms BEFORE the
   * click that caused it, so the trail printed the effect above its cause.
   * groupTrail orders internally, so this is the rendered proof.
   */
  it('prints the click above the departure it caused', () => {
    hook.mockReturnValue({
      data: payload([
        ev('pageview', '/pricing', T(0), undefined, 4),
        ev('outbound_link', '/pricing', T(541), { url: 'https://pulse.ciphera.net/signup', page_path: '/pricing' }),
        ev('header_cta_get_started', '/pricing', T(580)),
      ]),
      error: undefined,
      isLoading: false,
    })
    const { container } = renderTrail()
    const rows = [...container.querySelectorAll('div.mt-1 > div')].map((d) => (d.textContent ?? '').trim())
    expect(rows).toEqual(['header_cta_get_started', 'Left for pulse.ciphera.net/signup'])
  })
})

describe('VisitTrail round 7 — the last visible chip', () => {
  /**
   * 🔴 A REGRESSION ROUND 7 INTRODUCED AND ROUND 6'S TEST CAUGHT. The guard that
   * refuses to switch the last kind off counted `next.size`, and TRAIL_KINDS went
   * from four kinds to seven. On a visit with two kinds present, both visible
   * chips could then be switched off — three kinds with no steps and no chip kept
   * the set size above one — and the reader got an empty trail, which looks
   * exactly like a visit that recorded nothing.
   *
   * Two kinds is the sharpest case: the set says 7, the screen says 2.
   *
   * MUTATION CHECK: count `next.size` instead of the kinds this visit has and
   * this goes red with zero chips pressed.
   */
  it('refuses to switch off the last chip on screen, however many kinds exist', () => {
    hook.mockReturnValue({
      data: payload([
        ev('pageview', '/a', T(0), undefined, 3),
        ev('pulse_copy', '/a', T(400), { chars: '9', source_tag: 'p', page_path: '/a' }),
      ]),
      error: undefined,
      isLoading: false,
    })
    const { container } = renderTrail()
    const chips = () => container.querySelectorAll('button[aria-pressed]')
    expect(chips()).toHaveLength(2)

    for (const label of ['Pages', 'Copies']) {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${label}`) }))
    }
    const pressed = [...chips()].filter((b) => b.getAttribute('aria-pressed') === 'true')
    expect(pressed).toHaveLength(1)
    // and the trail still has rows rather than nothing
    expect(container.querySelectorAll('div.relative.flex').length).toBeGreaterThan(0)
  })
})
