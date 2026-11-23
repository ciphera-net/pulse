import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { VisitorMeta } from '../VisitorMeta'
import { JourneyStrand } from '../JourneyStrand'
import type { VisitorRow } from '@/lib/api/visitors'

// ─── The Visitors surface's accessibility contract ──────────────────
//
// Audit: Pulse/docs/audits/10-09-2026-visitors-accessibility-audit.md.
//
// 🔴 THIS FILE ASSERTS WHAT A SCREEN READER RECEIVES, NOT THAT AXE IS QUIET.
// Axe found exactly ONE of the surface's defects (aria-prohibited-attr on the
// active-now dot). It found nothing on the month ribbon or the presence field,
// because automated tooling has no rule for "conveys information with no text
// equivalent" — a strip of empty divs is indistinguishable from decoration. So
// the assertions below read the accessibility tree and check the words are
// there. An axe pass is kept as a floor, not as the test.

function visitor(i: number, over: Partial<VisitorRow> = {}): VisitorRow {
  return {
    visitor_key: String(i).padStart(32, 'a'),
    month: '2026-09',
    first_seen: '2026-09-01T10:00:00Z',
    last_seen: '2026-09-09T10:00:00Z',
    visits: 3,
    pageviews: 7,
    events: 1,
    country: 'BE',
    region: null,
    city: 'Brussels',
    device_type: 'desktop',
    browser: 'Firefox',
    os: 'Linux',
    language: 'en',
    screen_resolution: '1920x1080',
    referrer: 'https://google.com/',
    entry_path: '/',
    active_now: false,
    ...over,
  }
}

/**
 * The `aria-prohibited-attr` check, stated directly.
 *
 * A <span> or <div> with no role maps to `generic`, and `generic` PROHIBITS
 * naming — so `aria-label` on one is invalid and assistive technology is entitled
 * to drop the name. axe rates it SERIOUS. Asserted against the rendered DOM
 * rather than the source text, because the source contains the string
 * "aria-label" in comments explaining exactly this.
 */
function prohibitedNames(el: HTMLElement): string[] {
  return [...el.querySelectorAll('span[aria-label]:not([role]), div[aria-label]:not([role])')].map(
    (n) => `${n.tagName.toLowerCase()}[aria-label="${n.getAttribute('aria-label')}"]`,
  )
}

// The roster these parts once sat in (VisitorRowLink, the presence field) left with the Visitors page that replaced it
// (23-11-2026). What stays pinned is the two parts the visitor's own page still draws.

describe('the meta line and the journey strand say what they mean', () => {
  const v = visitor(1)

  it('reads the meta line\'s segments with a comma between each, never run together', () => {
    const { getByRole } = render(
      <a href="/x">
        <VisitorMeta country={v.country} city={v.city} browser={v.browser} os={v.os} deviceType={v.device_type} referrer={v.referrer} collectsReferrers />
      </a>,
    )
    // 🔴 THE MEASURED "BEFORE": "BelgiumFirefoxLinux". The accessible-name algorithm joins adjacent inline text with no
    // separator, so the COMMA is what is guaranteed (a prosodic pause with or without a space after it).
    expect(getByRole('link', { name: /Brussels, Belgium,\s?Firefox,\s?Linux,\s?Desktop/ })).toBeTruthy()
  })

  it('keeps the journey strand out of the reading order: it is a picture of what the page states in words', () => {
    const { container } = render(<JourneyStrand pages={v.pageviews} eventAt={[1]} />)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('aria-hidden')).toBe('true')
    expect(prohibitedNames(container)).toEqual([])
  })
})
