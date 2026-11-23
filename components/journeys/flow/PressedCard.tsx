'use client'

import type { ReactNode } from 'react'
import { ArrowBendDownRight, ArrowRight, Eye, Files, FunnelSimple, SignOut, X } from '@phosphor-icons/react'
import { Button } from '@ciphera-net/facet'
import PathLabel from '@/components/pages/PathLabel'
import { FRAME_SURFACE } from '@/lib/dashboard/frameClasses'
import { formatNumber } from '@/lib/utils/format'
import { cn } from '@/lib/utils'
import type { JourneyFlow } from '@/lib/api/journeys'
import { pathOfNode, stepOfNode } from '@/lib/journeys/chain'
import type { SankeyLink } from '@/lib/journeys/sankeyLayout'
import { OTHER, nextOf, otherIndices, otherPages, otherVisits, sessionsAt, stepName, stepVisits } from './flowMath'

// ---------------------------------------------------------------------------
// The pressed journey's card (rebuilt 18-11-2026 to match the dashboard and the Pages page), in a block of its own under
// the chart's (12 px). Built only of
// parts the Pages page already uses:
//   the blocks' title row (their name style, the step in the small grey line; no colour mark);
//   an opened page's measure cells (PagesList.tsx: the name at 13 px, the figure at 20 px, a line of context);
//   an opened page's actions row (two ghost-button cells with a hairline between them).
// A page:        Visits, Went on, Left the site, Top next page.
// Other pages:   Visits, Pages, Went on, Left the site (its pages are drawn into the chart, FlowChart.tsx).
// A link:        its visits and its share of each of its two pages.
// At the first step, from a server that does not count the visits that saw one page (no entry_only), every visit on
// a starting page went on: the card says where they went (Top next page, Next pages) in place of a "Left the site"
// that would always read 0.
// ---------------------------------------------------------------------------

export type Pin = { kind: 'node'; id: string } | { kind: 'link'; source: string; target: string }
interface Cell { key: string; icon: ReactNode; name: string; figure: ReactNode; context: string }

const atStep = (step: number) => (step === 0 ? 'at Entry' : `at step ${step + 1}`)
const pct = (n: number, of: number) => `${of > 0 ? Math.round((n / of) * 100) : 0}%`
const dash = <span className="text-neutral-600">—</span>

function nextCell(next: ReturnType<typeof nextOf>, visits: number, whose: 'its' | 'their'): Cell {
  return {
    key: 'next',
    icon: <ArrowBendDownRight />,
    name: 'Top next page',
    figure: next.top ? <span className="block truncate" title={next.top.path}>{next.top.path}</span> : dash,
    context: next.top ? `${formatNumber(next.top.n)} visitors, ${pct(next.top.n, visits)} of ${whose} visitors` : 'No page after it',
  }
}
const pagesNext = (next: ReturnType<typeof nextOf>) => `${formatNumber(next.named)}${next.more ? '+' : ''}`

export interface PressedCardProps {
  /** The chart's own read. */
  flow: JourneyFlow
  /** The six-step read: what came after the chart's last step. */
  deep?: JourneyFlow
  pin: Pin
  links: SankeyLink[]
  /** Pages a step the chart keeps before "Other pages". */
  kept: number
  /** The busiest route through the pressed page, for a funnel; empty for a link or "Other pages". */
  route: string[]
  /** Make a funnel of the route (a member); without it the card offers none. */
  onFunnel?: (route: string[]) => void
  onClose: () => void
}

export default function PressedCard({ flow, deep, pin, links, kept, route, onFunnel, onClose }: PressedCardProps) {
  const src = deep ?? flow
  const counted = src.entry_only !== undefined
  let name: ReactNode
  let where: string
  let cells: Cell[]

  if (pin.kind === 'link') {
    const step = stepOfNode(pin.source)
    const a = pathOfNode(pin.source)
    const b = pathOfNode(pin.target)
    const value = links.find((l) => l.source === pin.source && l.target === pin.target)?.value ?? 0
    const visitsOf = (s: number, p: string) => {
      if (p === '(other)') return otherVisits(src, s, kept)
      const i = src.columns[s]?.top.findIndex(([q]) => q === p) ?? -1
      return i < 0 ? 0 : sessionsAt(src, s, i)
    }
    const label = (p: string) => (p === '(other)' ? 'Other pages' : p)
    name = (
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="truncate">{label(a)}</span>
        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-neutral-500" aria-hidden="true" />
        <span className="truncate">{label(b)}</span>
      </span>
    )
    where = `${stepName(step)} to step ${step + 2}`
    cells = [
      { key: 'visits', icon: <Eye />, name: 'Visitors', figure: formatNumber(value), context: `went from ${label(a)} straight to ${label(b)}` },
      { key: 'of-a', icon: <ArrowRight />, name: `Share of ${label(a)}`, figure: pct(value, visitsOf(step, a)), context: `of its visitors ${atStep(step)}` },
      { key: 'of-b', icon: <ArrowBendDownRight />, name: `Share of ${label(b)}`, figure: pct(value, visitsOf(step + 1, b)), context: `of its visitors ${atStep(step + 1)}` },
    ]
  } else {
    const step = stepOfNode(pin.id)
    const path = pathOfNode(pin.id)
    const col = src.columns[step]
    const total = stepVisits(src, step)
    const known = step < src.depth - 1
    const firstUncounted = step === 0 && !counted
    if (path === '(other)') {
      const set = otherIndices(src, step, kept)
      const visits = otherVisits(src, step, kept)
      const pages = otherPages(src, step, kept)
      const next = nextOf(src, step, set)
      name = 'Other pages'
      where = stepName(step)
      cells = firstUncounted
        ? [
            { key: 'visits', icon: <Eye />, name: 'Visitors', figure: formatNumber(visits), context: `${pct(visits, total)} of journeys began on them` },
            { key: 'pages', icon: <Files />, name: 'Pages', figure: formatNumber(pages), context: `past the ${kept} busiest ${atStep(step)}` },
            nextCell(next, visits, 'their'),
            { key: 'spread', icon: <Files />, name: 'Next pages', figure: pagesNext(next), context: 'different pages seen next' },
          ]
        : [
            { key: 'visits', icon: <Eye />, name: 'Visitors', figure: formatNumber(visits), context: `${pct(visits, total)} of the visitors ${atStep(step)}` },
            { key: 'pages', icon: <Files />, name: 'Pages', figure: formatNumber(pages), context: `past the ${kept} busiest ${atStep(step)}` },
            { key: 'on', icon: <ArrowRight />, name: 'Went on', figure: known ? formatNumber(next.on) : dash, context: known ? `${pct(next.on, visits)} of their visitors` : `Not read past step ${step + 1}` },
            { key: 'left', icon: <SignOut />, name: 'Left the site', figure: known ? formatNumber(visits - next.on) : dash, context: known ? `${pct(visits - next.on, visits)} of their visitors` : `Not read past step ${step + 1}` },
          ]
    } else {
      const i = col?.top.findIndex(([p]) => p === path) ?? -1
      const visits = i < 0 ? 0 : sessionsAt(src, step, i)
      const next = nextOf(src, step, new Set([i < 0 ? OTHER : i]))
      // Measured against the title row (its parent, which takes the row's room), less the step's few words.
      name = <PathLabel path={path} reserve={96} title={path} />
      where = stepName(step)
      cells = firstUncounted
        ? [
            { key: 'visits', icon: <Eye />, name: 'Visitors', figure: formatNumber(visits), context: `${pct(visits, total)} of journeys began here` },
            nextCell(next, visits, 'its'),
            { key: 'spread', icon: <Files />, name: 'Next pages', figure: pagesNext(next), context: 'different pages seen next' },
          ]
        : [
            { key: 'visits', icon: <Eye />, name: 'Visitors', figure: formatNumber(visits), context: `${pct(visits, total)} of the visitors ${atStep(step)}` },
            { key: 'on', icon: <ArrowRight />, name: 'Went on', figure: known ? formatNumber(next.on) : dash, context: known ? `${pct(next.on, visits)} of its visitors` : `Not read past step ${step + 1}` },
            { key: 'left', icon: <SignOut />, name: 'Left the site', figure: known ? formatNumber(visits - next.on) : dash, context: known ? `${pct(visits - next.on, visits)} of its visitors` : `Not read past step ${step + 1}` },
            known ? nextCell(next, visits, 'its') : { key: 'next', icon: <ArrowBendDownRight />, name: 'Top next page', figure: dash, context: `Not read past step ${step + 1}` },
          ]
    }
  }

  const four = cells.length === 4
  const funnel = onFunnel && route.length > 1
  return (
    <section className={`${FRAME_SURFACE} mt-3 min-w-0 [container-type:inline-size]`} data-journeys-card={pin.kind === 'link' ? 'link' : name === 'Other pages' ? 'other' : 'page'}>
      <div className="flex min-w-0 items-center border-b border-white/[0.08] px-6 pb-2 pt-3">
        {/* The blocks' name style in a span that takes the row's room: a page's address measures that room to choose
            how much of itself to write ("/bikes/…/x"), so the span must not be as narrow as the words it holds. */}
        <span className="flex h-[34px] min-w-0 flex-1 items-center gap-x-3 whitespace-nowrap text-sm font-medium text-white" data-journeys-card-name="">
          {name}
          <span className="shrink-0 text-[11px] font-normal text-neutral-500" data-journeys-card-where="">{where}</span>
        </span>
      </div>
      <div className={cn('grid grid-cols-2', four ? 'cq-[720px]:grid-cols-4' : 'cq-[720px]:grid-cols-3')} data-journeys-card-cells="">
        {cells.map((c, n) => (
          <div
            key={c.key}
            className={cn(
              'min-w-0 border-white/[0.08] px-5 py-4',
              // Two by two where the card is narrow, one row where it has the room (as the Pages strip).
              'cqmax-[719.98px]:odd:border-r cqmax-[719.98px]:[&:nth-child(-n+2)]:border-b',
              !four && 'cqmax-[719.98px]:last:col-span-2 cqmax-[719.98px]:last:border-r-0',
              n > 0 && 'cq-[720px]:border-l',
            )}
            data-journeys-cell={c.key}
          >
            <span className="flex min-w-0 items-center gap-2 text-[13px] text-neutral-400">
              <span className="shrink-0 [&>svg]:h-4 [&>svg]:w-4">{c.icon}</span>
              <span className="truncate">{c.name}</span>
            </span>
            <div className="mt-0.5 min-w-0 truncate text-xl font-semibold tabular-nums text-white" data-cell-figure="">{c.figure}</div>
            <div className="mt-0.5 min-h-4 text-[11px] tabular-nums text-neutral-500" data-cell-context="">{c.context}</div>
          </div>
        ))}
      </div>
      {/* The opened page's actions row (PagesList.tsx): two cells of one grid, a hairline between them. */}
      <div className="grid grid-cols-2 border-t border-white/[0.08]" data-journeys-card-actions="">
        {funnel && (
          <Button
            variant="ghost"
            size="sm"
            title={`A new funnel: ${route.join(' → ')}`}
            onClick={() => onFunnel?.(route)}
            className="h-11 w-full min-w-0 justify-start gap-1.5 rounded-none border-r border-white/[0.08] px-5 text-[13px] font-normal text-neutral-300 [&_svg]:size-3.5 [&_svg]:shrink-0"
            data-journeys-funnel=""
          >
            <FunnelSimple className="text-muted-foreground" aria-hidden="true" />
            <span className="truncate">Make a funnel of this route</span>
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          title="Show every journey (Esc)"
          className={cn('h-11 w-full min-w-0 justify-start gap-1.5 rounded-none px-5 text-[13px] font-normal text-neutral-300 [&_svg]:size-3.5 [&_svg]:shrink-0', funnel ? '' : 'col-span-2')}
          data-journeys-unpin=""
        >
          <X className="text-muted-foreground" aria-hidden="true" />
          <span className="truncate">Show every journey</span>
        </Button>
      </div>
    </section>
  )
}
