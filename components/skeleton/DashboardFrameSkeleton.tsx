import { FRAME_CARD, FRAME_SURFACE } from '@/lib/dashboard/frame'
import { HeatMapSkeletonBody } from './HeatMapSkeletonBody'
import { SkeletonLine } from './primitives'

// ---------------------------------------------------------------------------
// The dashboard's skeleton in the NEW frame's shape (components/surfaces/DashboardFrame.tsx).
//
// Every box stands where the real thing lands, so nothing moves when the data arrives: the toolbar's three
// controls, the chart with its rail of five tiles, six blocks of one size with seven row slots each, the heat map.
// Measured on the built page from 390 to 1920 px wide: the page is as tall on this skeleton as on its data. The
// one part whose height follows its width is the heat map (square cells), and its body is built on the grid's own
// arithmetic (HeatMapSkeletonBody). Today's skeleton is 640 px shorter than the new page and still draws a
// campaigns table the dashboard no longer has.
//
// It is drawn beside today's on a member's page and the stylesheet shows one of the two (`skeleton-new-shape`,
// lib/skeleton/look.ts says why). No state, nothing read: the server and the browser draw the same thing.
// ---------------------------------------------------------------------------

/** How wide each block's tab row is, and how far its seven rows reach, so six blocks do not look like one stamp. */
const BLOCKS: { tabs: number; shares: number[] }[] = [
  { tabs: 244, shares: [76, 62, 51, 43, 34, 27, 19] }, // Sources
  { tabs: 176, shares: [72, 66, 48, 41, 30, 22, 15] }, // Pages
  { tabs: 380, shares: [80, 55, 47, 36, 31, 20, 12] }, // Locations
  { tabs: 262, shares: [68, 60, 52, 39, 28, 24, 17] }, // Technology
  { tabs: 300, shares: [74, 58, 44, 40, 26, 18, 10] }, // Outbound
  { tabs: 64, shares: [70, 64, 50, 37, 33, 21, 14] }, // Events: a name, no tabs
]

/** One tile of the chart's rail: the metric's name, its figure, its note. */
function Tile() {
  return (
    <div className="flex min-h-[93px] flex-col justify-center gap-2 border-b border-neutral-800 px-4 py-3 last:min-h-[92px] last:border-b-0 md:min-h-0 md:flex-1 md:last:min-h-0">
      <SkeletonLine className="h-3 w-24 max-w-full" />
      <SkeletonLine className="h-6 w-16 max-w-full" />
      <SkeletonLine className="h-2.5 w-28 max-w-full" />
    </div>
  )
}

/** A block of the frame: its tab row (38 px with what is under it), seven row slots, its foot. 442 px, as the real one. */
function Block({ tabs, shares }: { tabs: number; shares: number[] }) {
  return (
    <div className={FRAME_CARD}>
      <div className="mb-4 flex h-[38px] shrink-0 items-center justify-between gap-2">
        <SkeletonLine className="h-[34px] max-w-[70%]" style={{ width: tabs }} />
        <SkeletonLine className="h-3 w-9 shrink-0" />
      </div>
      <div className="min-h-0 flex-1 space-y-2">
        {shares.map((share, i) => (
          <div key={i} className="flex h-9 items-center justify-between gap-4">
            <SkeletonLine className="h-8" style={{ width: `${share}%` }} />
            <SkeletonLine className="h-3 w-10 shrink-0" />
          </div>
        ))}
      </div>
      <div className="mt-3.5 flex h-6 shrink-0 items-center justify-end">
        <SkeletonLine className="h-5 w-[92px]" />
      </div>
    </div>
  )
}

export function DashboardFrameSkeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`w-full max-w-7xl mx-auto px-4 sm:px-6 pb-8 ${className}`}>
      {/* The toolbar: the live count, then the filter and the range at the right (two lines on a phone). */}
      <div className="-mt-2.5 mb-0.5 py-2.5">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <SkeletonLine className="h-10 w-10" />
          <div className="hidden flex-1 sm:block" />
          <SkeletonLine className="h-10 w-[92px]" />
          <SkeletonLine className="h-10 w-[257px] max-w-full" />
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {/* The chart: the rail of five tiles and the plot, 502 px. */}
        <div className={`${FRAME_SURFACE} w-full overflow-hidden`}>
          <div className="grid md:grid-cols-[236px_1fr] md:grid-rows-[500px]">
            <div className="grid grid-cols-2 border-b border-neutral-800 md:flex md:flex-col md:border-b-0 md:border-r">
              {Array.from({ length: 5 }).map((_, i) => (
                <Tile key={i} />
              ))}
            </div>
            <div className="flex min-h-[348px] flex-col gap-3 p-4 md:min-h-0">
              <SkeletonLine className="h-3.5 w-[168px] max-w-full shrink-0" />
              <SkeletonLine className="min-h-[240px] w-full flex-1" />
            </div>
          </div>
        </div>

        {/* The six blocks, one size, 12 px apart. */}
        <div className="grid gap-3 lg:grid-cols-2 [&>*]:min-w-0">
          {BLOCKS.map((block, i) => (
            <Block key={i} {...block} />
          ))}
        </div>

        {/* The heat map: its switch (34 px, 16 px under it), then the body its data will fill. */}
        <div className={`${FRAME_SURFACE} flex min-w-0 flex-col p-6`}>
          <div className="mb-4 flex h-[34px] shrink-0 items-center">
            <SkeletonLine className="h-[34px] w-[348px] max-w-full" />
          </div>
          <HeatMapSkeletonBody />
        </div>
      </div>
    </div>
  )
}
