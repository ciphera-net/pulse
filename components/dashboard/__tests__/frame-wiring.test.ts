import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// Source-level pins for the DASHBOARD FRAME (every reader's since 15-11-2026; the beta `new-dashboard` until then),
// the idiom of phase3-wiring.test.ts: the frame hands each block its props, and the surface mounts the frame alone
// (the arrangement it replaced left the surface on 16-11-2026). Dropping a prop leaves every component test green
// while the page silently loses a filter, a denominator or a share link's diet.
const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

describe('the new dashboard frame: every block is wired as on today\'s page', () => {
  const frame = read('components/surfaces/DashboardFrame.tsx')

  it('passes the true totals and the page\'s filters to every block that takes them', () => {
    // Five blocks take totals: Sources, Pages, Locations and Technology, as on today's page, and the Events block,
    // whose conversion is an event's visitors over the range's (today's Events card shows no share and takes none).
    expect(frame.match(/totals=\{totals\}/g)?.length).toBe(5)
    expect(frame).toMatch(/<ContentSignals\n(?:\s+\w+=\{[^}]*\}+\n)*\s+totals=\{totals\}\n/)
    // Sources, Pages, Locations, Technology, Events and the heat map thread the filters. (Outbound's links ride in
    // the Pages block and get its filters from there: since 16-11-2026 their read sends them. Events takes them
    // since 15-11-2026, for an opened event's properties.)
    expect(frame.match(/filters=\{filtersParam \|\| undefined\}/g)?.length).toBe(6)
  })

  it('turns the full lists and drill-downs off from the one flag, and keeps a share link\'s campaigns on its payload', () => {
    expect(frame.match(/memberFeatures=\{caps\.fullReads\}/g)?.length).toBe(5)
    expect(frame).toContain('campaigns={caps.fullReads ? undefined : (dashboard?.campaigns ?? [])}')
    // No Outbound on a share link, as today: its links are the Pages block's fourth tab, and the block is handed
    // them only where their read is served.
    expect(frame).toContain('outbound={caps.fullReads ? { period, goalCounts: dashboard?.goal_counts ?? [], goalsImported: dashboard?.imported_goals, trackingOff: outboundOff, filterByLink: eventFilters } : undefined}')
    // And the Outbound block itself is not in the frame any more.
    expect(frame).not.toContain('<Outbound')
    expect(frame).not.toContain("from '@/components/dashboard/Outbound'")
  })

  it('hands every block the live window, so a block never describes the calendar day in realtime', () => {
    // Sources, Pages (and its Outbound tab through it), Locations, Technology, Events.
    expect(frame.match(/liveMinutes=\{liveMinutes\}/g)?.length).toBe(5)
  })

  it('orders the blocks Sources, Pages / Locations, Technology / Events, then the bottom', () => {
    const at = (tag: string) => frame.indexOf(`<${tag}\n`)
    const order = ['Sources', 'ContentStats', 'Audience', 'TechSpecs', 'ContentSignals'].map(at)
    expect(order.every((i) => i > -1)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    expect(frame.indexOf('<DashboardBottom ')).toBeGreaterThan(order[order.length - 1])
  })

  it('closes with the bottom (R35) in place of the heat map across the page, with the page\'s window and filters', () => {
    // What converts beside the week, then Search, Uptime and Performance: components/dashboard/DashboardBottom.tsx.
    expect(frame).toContain('<DashboardBottom siteId={siteId} dateRange={dateRange} period={period} filters={filtersParam || undefined} />')
    // Today's heat map across the page is today's arrangement's alone.
    expect(frame).not.toContain('PeakHours')
    // Not in realtime, and not on a share link, which is served neither hour buckets nor the bottom's own reads.
    expect(frame).toContain('{!isLive && caps.hourlyBuckets && caps.fullReads && (\n          <DashboardBottom ')
  })

  it('puts the five blocks in ONE grid, the fifth across both columns, and draws no section title', () => {
    expect(frame.match(/grid gap-3 lg:grid-cols-2/g)?.length).toBe(1)
    expect(frame).not.toContain('SectionHeader')
    // Events is alone in the last row: a half-wide block beside an empty cell would read as a missing one.
    expect(frame).toContain('<div className="lg:col-span-2" data-frame-events="">\n            <ContentSignals\n')
    expect(frame.match(/lg:col-span-2/g)?.length).toBe(1)
  })

  it('hands the Events block the page\'s period, which its property reads send (All time past 366 days needs it)', () => {
    expect(frame).toMatch(/<ContentSignals\n(?:\s+\w+=\{[^}]*\}+\n)*\s+period=\{period\}\n/)
  })

  it('hands the Events block no scroll depth: it left the dashboard', () => {
    expect(frame).not.toContain('scrollDepth=')
  })

  it('tells the Outbound tab when the site has its outbound links switched off, as today\'s page tells its card', () => {
    // Without it the tab of a site that switched the option off reads "Try a longer range." for ever.
    expect(frame.match(/trackingOff: outboundOff/g)?.length).toBe(1)
    expect(frame).not.toContain('trackingOff={outboundOff}')
    const page = read('components/surfaces/DashboardSurface.tsx')
    // The surface hands the value to the frame, and to nothing else: the Outbound card left with today's arrangement.
    expect(page).not.toContain('trackingOff={outboundOff}')
    expect(page.match(/outboundOff=\{outboundOff\}/g)?.length).toBe(1)
  })

  it('tells the blocks they are in the frame', () => {
    expect(frame).toContain('<DashboardFrameProvider>')
  })
})

describe('the surface mounts the frame for every reader, and holds nothing of the arrangement it replaced', () => {
  const page = read('components/surfaces/DashboardSurface.tsx')

  it('mounts the frame for every reader: no flag is read, public pages included (15-11-2026)', () => {
    expect(page).not.toMatch(/const frame\b/)
    // The one flag the page reads is a beta's that decides what its filter offers (the event filter, R45), never the
    // frame's.
    expect(page.match(/useFeature\([^)]*\)/g) ?? []).toEqual(['useFeature(EVENT_FILTERS_FLAG)'])
    expect(page).not.toContain('NEW_DASHBOARD_FLAG')
  })

  it('mounts the frame alone, with the one deck', () => {
    expect(page.match(/<CommandDeck\n/g)?.length).toBe(1)
    expect(page.match(/<DashboardFrame\n/g)?.length).toBe(1)
    expect(page).toContain('deck={\n')
    // Nothing of today's arrangement: no section titles, no blocks of its own, no Peak hours, no old filter.
    for (const gone of ['SectionHeader', '<Sources', '<Audience', '<TechSpecs', '<ContentStats', '<ContentSignals', '<Outbound', 'PeakHours', 'FilterPills', 'FilterButton', 'FilterBuilder', 'useFilterBuilder', 'if (frame)']) {
      expect(page, gone).not.toContain(gone)
    }
  })

  it('has no bucket picker and asks a range of several days in days', () => {
    expect(page).not.toContain('intervalPicker')
    expect(page).not.toContain('multiDayInterval')
    expect(page).toContain("(dateRange.start === dateRange.end ? (isYoungSingleDay ? 'minute' : 'hour') : 'day')")
  })

  it('keeps the toolbar at the top in the frame, on the failed-load page too', () => {
    expect(page).toContain('<FrameToolbar>{toolbarControls()}</FrameToolbar>')
    // One definition of the toolbar row, used by the page and by the failed-load state.
    expect(page.match(/\{toolbarRow\(\)\}/g)?.length).toBe(2)
  })
})

describe('glass lives in the stylesheet, on tokens both themes define', () => {
  const css = read('styles/globals.css')

  it('defines the three recipes', () => {
    for (const name of ['.glass-block::before', '.glass-band', '.glass-panel']) expect(css).toContain(name)
  })

  it('keeps any filter off the block itself', () => {
    // On the element, a backdrop filter makes it the containing block of every fixed descendant and a backdrop
    // root for anything see-through inside it. The block's own rule may set position and isolation, no filter.
    const own = css.slice(css.indexOf('.glass-block {'), css.indexOf('.glass-block::before'))
    expect(own).toContain('isolation: isolate')
    expect(own).not.toContain('backdrop-filter')
  })

  it('makes the toolbar band the page\'s only blur, on a layer of its own (R64)', () => {
    // A rule's body: from its selector to the first closing brace after it.
    const body = (selector: string) => {
      const at = css.indexOf(`${selector} {`)
      expect(at, selector).toBeGreaterThanOrEqual(0)
      return css.slice(at, css.indexOf('}', at))
    }
    // The blocks keep their see-through fill and drop the blur that drew nothing over the flat page (the band's
    // one-frame flicker on macOS in Low Power Mode was a blur over blurs).
    expect(body('.glass-block::before')).toContain('background-color: rgb(var(--card) / var(--glass-block))')
    expect(body('.glass-block::before')).not.toContain('backdrop-filter')
    expect(body('.glass-band')).toContain('backdrop-filter: blur(24px) saturate(1.5);')
    expect(body('.glass-band')).toContain('transform: translateZ(0);')
  })

  it('gives each theme its own fill for each recipe', () => {
    for (const token of ['--glass-block', '--glass-band', '--glass-panel']) {
      // Once in dark's :root, once in the light class and once in the match-system block.
      expect(css.match(new RegExp(`${token}: 0\\.\\d+;`, 'g'))?.length, token).toBe(3)
    }
  })

  it('draws its hairlines in the ink, which follows the theme', () => {
    expect(css).toContain('border-bottom: 1px solid rgb(var(--white) / 0.06)')
    // A block's surface is one of the frame's class names, which are plain strings in a module the server can read
    // too (lib/dashboard/frameClasses.ts); a pop-up's surface is chosen in the client-only module.
    expect(read('lib/dashboard/frameClasses.ts')).toContain("'glass-block rounded-none border border-white/[0.08]'")
    expect(read('lib/dashboard/frame.tsx')).toContain("'glass-panel border border-white/[0.08]'")
  })
})
