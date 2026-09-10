import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { MonthRibbon } from '../MonthRibbon'
import { PresenceField } from '../PresenceField'
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
 * A faithful copy of VisitorRowLink's markup, which is not exported.
 *
 * ⚠️ It is a copy, so it can drift from the page. That is a real weakness and the
 * alternative was worse: rendering the page needs the router, SWR and a session,
 * and a test that heavy stops being run. The staging walkthrough runs axe against
 * the REAL page and is what catches drift — this catches the regression.
 */
function RosterRow({ activeNow = false }: { activeNow?: boolean }) {
  const v = visitor(1, { active_now: activeNow })
  return (
    <a href="/x" className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-white">Quiet Reader</span>
          {v.active_now && (
            <>
              <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-green-500" />
              <span className="sr-only">on the site now</span>
            </>
          )}
        </span>
        <VisitorMeta
          className="mt-1"
          country={v.country}
          city={v.city}
          browser={v.browser}
          os={v.os}
          deviceType={v.device_type}
          referrer={v.referrer}
          collectsReferrers
        />
      </div>
      <span className="hidden w-24 justify-end sm:flex">
        <JourneyStrand pages={v.pageviews} eventAt={v.events > 0 ? [1] : []} />
        <span className="sr-only">
          last journey: {v.pageviews} {v.pageviews === 1 ? 'page' : 'pages'}
          {v.events > 0 ? ', with an event' : ''}.{' '}
        </span>
      </span>
      <span className="w-16 shrink-0 text-right text-sm tabular-nums text-neutral-300">
        <span aria-hidden="true">{v.visits}</span>
        <span className="sr-only">
          {v.visits} {v.visits === 1 ? 'visit' : 'visits'},{' '}
        </span>
      </span>
      <span className="w-16 shrink-0 text-right text-sm tabular-nums text-neutral-300">
        <span aria-hidden="true">{v.pageviews}</span>
        <span className="sr-only">
          {v.pageviews} {v.pageviews === 1 ? 'page' : 'pages'},{' '}
        </span>
      </span>
      <span className="w-24 shrink-0 text-right text-sm tabular-nums text-neutral-500">
        <span aria-hidden="true">2h ago</span>
        <span className="sr-only">last seen 2h ago</span>
      </span>
    </a>
  )
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

describe('a roster row says what its numbers mean', () => {
  it('labels the three numerals', () => {
    const { getByRole, queryByRole } = render(<RosterRow />)

    // 🔴 THE MEASURED "BEFORE", kept verbatim so the regression is recognisable.
    // The row's whole accessible name ended:
    //      "…viaGoogle 372h ago"
    // — that is 3 visits, 7 pages and "2h ago" run together with no labels and no
    // separators, because this is a flex layout and not a table, so nothing
    // associates a cell with its column header. A screen reader reads
    // "three seventy-two h ago".
    expect(queryByRole('link', { name: /372h ago/ })).toBeNull()

    // Each query below matches on the ACCESSIBLE NAME, computed by the same
    // algorithm the platform uses — so aria-hidden nodes (the visible numerals)
    // are excluded and the visually-hidden phrases are what is being read.
    expect(getByRole('link', { name: /3 visits/ })).toBeTruthy()
    expect(getByRole('link', { name: /7 pages/ })).toBeTruthy()
    expect(getByRole('link', { name: /last seen 2h ago/ })).toBeTruthy()
    // The strand column has a header ("Last journey") and its cell was a
    // decorative SVG marked aria-hidden — a labelled column with nothing in it.
    expect(getByRole('link', { name: /last journey: 7 pages, with an event/ })).toBeTruthy()
    // And the meta segments no longer run together as "BelgiumFirefoxLinux".
    //
    // ⚠️ The space after each comma is not required. The accessible-name
    // algorithm concatenates adjacent inline text with no separator and collapses
    // trailing whitespace; the COMMA is what is guaranteed, and a comma is a
    // prosodic pause with or without a space after it.
    expect(getByRole('link', { name: /Brussels, Belgium,\s?Firefox,\s?Linux,\s?Desktop/ })).toBeTruthy()
  })

  it('carries "on the site now" where AT cannot drop it', () => {
    const { container, getByRole } = render(<RosterRow activeNow />)
    // getByRole matches on the ACCESSIBLE NAME, so this fails if the text is not
    // in the tree — including if it were an aria-label the platform discards.
    expect(getByRole('link', { name: /on the site now/ })).toBeTruthy()

    // The old form put aria-label on a bare <span>: `generic` prohibits naming,
    // so the name may be discarded entirely. This is the one defect on the
    // surface that automated tooling did catch.
    expect(prohibitedNames(container)).toEqual([])
  })
})

describe('the month ribbon has a text equivalent', () => {
  it('names every active day, not just the axis', () => {
    const { container } = render(
      <MonthRibbon month="2026-09" visitsByDay={{ 3: 1, 7: 2 }} today={9} resetsInDays={21} />,
    )
    const figure = container.querySelector('[role="img"]')
    expect(figure).not.toBeNull()
    const label = figure!.getAttribute('aria-label') ?? ''

    // 🔴 THE MEASURED "BEFORE": the ribbon's entire accessible text was
    //      "September, day by dayidentity resets in 21 days18152229"
    // — the captions, then the bare day-axis numbers 1/8/15/22/29, and nothing
    // about when this visitor was actually here. All 30 cells carried their data
    // only in a `title` attribute, which is mouse-hover only.
    expect(label).toMatch(/3 September, 1 visit/)
    expect(label).toMatch(/7 September, 2 visits/)
    expect(label).toMatch(/Visits on 2 of 30 days/)
    expect(label).toMatch(/Today is 9 September/)
  })

  it('says "no visits" rather than "0 visits" for an empty month', () => {
    // A day with a measured zero and a month with no visits are different
    // statements, and the ribbon draws them differently too (outline vs fill).
    const { container } = render(
      <MonthRibbon month="2026-09" visitsByDay={{}} today={null} resetsInDays={null} />,
    )
    const label = container.querySelector('[role="img"]')!.getAttribute('aria-label') ?? ''
    expect(label).toMatch(/no visits on any of its 30 days/)
    expect(label).not.toMatch(/0 visits/)
  })

  it('keeps its captions OUTSIDE the graphic, as page text', () => {
    const { container } = render(
      <MonthRibbon month="2026-09" visitsByDay={{ 3: 1 }} today={9} resetsInDays={21} />,
    )
    const figure = container.querySelector('[role="img"]')!
    // role="img" makes a subtree presentational, so anything a reader should hear
    // in the page's flow has to sit outside it.
    expect(figure.textContent).not.toMatch(/identity resets/)
    expect(container.textContent).toMatch(/identity resets in 21 days/)
  })
})

describe('the presence field is a signposted summary, not silence', () => {
  const field = (n: number, active = 1) =>
    render(
      <PresenceField
        visitors={Array.from({ length: n }, (_, i) => visitor(i, { active_now: i < active }))}
        from={Date.parse('2026-09-01T00:00:00Z')}
        to={Date.parse('2026-09-10T00:00:00Z')}
        ticks={[{ at: Date.parse('2026-09-01T00:00:00Z'), label: '01/09' }]}
        activeCount={active}
        undrawn={0}
        caption="Each dot is one visitor"
        emptyLabel="No visitors in this range"
      />,
    )

  it('summarises the population and points at the roster', () => {
    const { container } = field(3)
    const text = container.textContent ?? ''
    expect(text).toMatch(/3 visitors, drawn as dots/)
    expect(text).toMatch(/1 on the site now/)
    // The signpost is the point: the field is a redundant visual summary, and a
    // sentence that did not say where the real list is would be a dead end.
    expect(text).toMatch(/also appears in the roster below, as text/)
  })

  it('hides every dot from the reading order', () => {
    const { container } = field(3)
    const dots = [...container.querySelectorAll('div[style*="left"]')]
    expect(dots.length).toBeGreaterThan(0)
    expect(dots.every((d) => d.getAttribute('aria-hidden') === 'true')).toBe(true)
  })

  it('names nothing with a prohibited aria-label', () => {
    expect(prohibitedNames(field(3).container)).toEqual([])
  })
})
