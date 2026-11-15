import { heatRowsHeight } from '@/lib/dashboard/heatmapGrid'
import { SkeletonLine } from './primitives'

/**
 * The heat map under its header while it loads, at the size its data will take: the hour axis, the seven rows as
 * one bar, the legend, and the line that names the busiest hour.
 *
 * The rows' bar takes its height from its own width (lib/dashboard/heatmapGrid.ts), as the square cells do, so the
 * card is as tall loading as loaded at every width: 504 px in a 1,232 px card, 402 px on a phone, where the grid is
 * small and the body's 270 px floor decides. Every other number here is the loaded card's own (components/
 * dashboard/PeakHours.tsx): the axis row of 12 px with 4 px under it, 2 px between the body's parts, the legend of
 * 11 px with 8 px over it, the last line of 16 px with 16 px over it.
 */
export function HeatMapSkeletonBody() {
  return (
    <>
      <div className="flex min-h-[270px] flex-1 flex-col justify-center gap-[2px]">
        <div className="mb-1 h-3" />
        <div className="flex gap-1.5">
          {/* The day names' column. */}
          <span className="w-7 shrink-0" />
          <div className="min-w-0 flex-1">
            <SkeletonLine className="h-0 w-full" style={{ paddingBottom: heatRowsHeight() }} />
          </div>
        </div>
        <div className="mt-2 flex h-[11px] items-center justify-end">
          <SkeletonLine className="h-2.5 w-28 max-w-full" />
        </div>
      </div>
      <div className="mt-4 flex h-4 items-center justify-center">
        <SkeletonLine className="h-3 w-56 max-w-full" />
      </div>
    </>
  )
}
