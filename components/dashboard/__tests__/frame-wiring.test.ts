import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// Source-level pins for the NEW DASHBOARD FRAME (beta `new-dashboard`), the idiom of phase3-wiring.test.ts: while
// the flag lives the page has two arrangements, and the frame's repeats each block's props. Dropping one there
// leaves every component test green while the beta silently loses a filter, a denominator or a share link's diet.
const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

describe('the new dashboard frame: every block is wired as on today\'s page', () => {
  const frame = read('components/surfaces/DashboardFrame.tsx')

  it('passes the true totals and the page\'s filters to every block that takes them', () => {
    // Four blocks take totals (Sources, Pages, Locations, Technology), as on today's page.
    expect(frame.match(/totals=\{totals\}/g)?.length).toBe(4)
    // Sources, Pages, Locations, Technology, Outbound and the heat map thread the filters.
    expect(frame.match(/filters=\{filtersParam \|\| undefined\}/g)?.length).toBe(6)
  })

  it('turns the full lists and drill-downs off from the one flag, and keeps a share link\'s campaigns on its payload', () => {
    expect(frame.match(/memberFeatures=\{caps\.fullReads\}/g)?.length).toBe(5)
    expect(frame).toContain('campaigns={caps.fullReads ? undefined : (dashboard?.campaigns ?? [])}')
    // No Outbound on a share link, as today.
    expect(frame).toContain('{caps.fullReads && (\n            <Outbound')
  })

  it('hands every block the live window, so a block never describes the calendar day in realtime', () => {
    // Sources, Pages, Locations, Technology, Outbound, Events.
    expect(frame.match(/liveMinutes=\{liveMinutes\}/g)?.length).toBe(6)
  })

  it('orders the blocks Sources, Pages / Locations, Technology / Outbound, Events, then the heat map', () => {
    const at = (tag: string) => frame.indexOf(`<${tag}\n`)
    const order = ['Sources', 'ContentStats', 'Audience', 'TechSpecs', 'Outbound', 'ContentSignals'].map(at)
    expect(order.every((i) => i > -1)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    expect(frame.indexOf('<PeakHours ')).toBeGreaterThan(order[order.length - 1])
  })

  it('puts the six blocks in ONE grid and draws no section title', () => {
    expect(frame.match(/grid gap-3 lg:grid-cols-2/g)?.length).toBe(1)
    expect(frame).not.toContain('SectionHeader')
  })

  it('hands the Events block no scroll depth: it left the dashboard', () => {
    expect(frame).not.toContain('scrollDepth=')
  })

  it('tells Outbound when the site has its outbound links switched off, as today\'s page does', () => {
    // Without it the block of a site that switched the option off reads "Try a longer range." for ever.
    expect(frame.match(/trackingOff=\{outboundOff\}/g)?.length).toBe(1)
    const page = read('components/surfaces/DashboardSurface.tsx')
    // Today's arrangement hands it to its own Outbound, and the surface hands the same value to the frame.
    expect(page.match(/trackingOff=\{outboundOff\}/g)?.length).toBe(1)
    expect(page.match(/outboundOff=\{outboundOff\}/g)?.length).toBe(1)
  })

  it('tells the blocks they are in the frame', () => {
    expect(frame).toContain('<DashboardFrameProvider>')
  })
})

describe('the surface mounts the frame under the flag, and nothing of today\'s page moved', () => {
  const page = read('components/surfaces/DashboardSurface.tsx')

  it('reads the beta flag closed by default', () => {
    // `=== true`: null (still loading, or /me failed) and false both leave today's page.
    expect(page).toContain('const frame = useFeature(NEW_DASHBOARD_FLAG) === true')
  })

  it('mounts the frame in place of its own arrangement, with the one deck', () => {
    expect(page.match(/<CommandDeck\n/g)?.length).toBe(1)
    expect(page).toContain('if (frame) {')
    expect(page).toContain('<DashboardFrame\n')
    expect(page).toContain('deck={deck}')
  })

  it('takes the chart\'s bucket picker away in the frame and asks a range of several days in days', () => {
    expect(page).toContain('intervalPicker={caps.hourlyBuckets && !frame}')
    expect(page).toContain("(frame ? 'day' : multiDayInterval)")
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

  it('keeps a block\'s blur off the block itself', () => {
    // On the element, a backdrop filter makes it the containing block of every fixed descendant and a backdrop
    // root for anything see-through inside it. The block's own rule may set position and isolation, no filter.
    const own = css.slice(css.indexOf('.glass-block {'), css.indexOf('.glass-block::before'))
    expect(own).toContain('isolation: isolate')
    expect(own).not.toContain('backdrop-filter')
  })

  it('gives each theme its own fill for each recipe', () => {
    for (const token of ['--glass-block', '--glass-band', '--glass-panel']) {
      // Once in dark's :root, once in the light class and once in the match-system block.
      expect(css.match(new RegExp(`${token}: 0\\.\\d+;`, 'g'))?.length, token).toBe(3)
    }
  })

  it('draws its hairlines in the ink, which follows the theme', () => {
    expect(css).toContain('border-bottom: 1px solid rgb(var(--white) / 0.06)')
    const frame = read('lib/dashboard/frame.tsx')
    expect(frame).toContain("'glass-block rounded-none border border-white/[0.08]'")
    expect(frame).toContain("'glass-panel border border-white/[0.08]'")
  })
})
