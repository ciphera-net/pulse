'use client'

import { formatCompactNumber } from '@/lib/utils/format'
import { guardedPctChange } from '@/lib/utils/pctChange'
import { RailDelta } from '@/components/funnels/FunnelRail'
import type { MapHover } from './MapView'

// The map tab's headline (PUL-14, gallery pair 5): the range's visitors and their
// trend at rest; while a country is hovered, that country's visitors and its share
// of the total. It replaces the map's tooltip. The trend uses the KPI rail's own
// guard and RailDelta, so it shows nothing where the rail shows nothing.
export function MapHeadline({ total, previous, hover }: { total: number | null; previous: number | null; hover: MapHover | null }) {
  if (total == null) return null
  const value = hover ? hover.visitors : total
  const share = hover && total > 0 ? Math.round((hover.visitors / total) * 100) : null
  const change = !hover && previous != null ? guardedPctChange(total, previous, previous) : null
  return (
    <div className="mb-2 min-h-[3.25rem]" aria-live="polite">
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-semibold tabular-nums text-white">{formatCompactNumber(value)}</span>
        {hover ? (
          share != null && <span className="text-xs text-neutral-400 tabular-nums">{share}% of visitors</span>
        ) : (
          <RailDelta change={change} />
        )}
      </div>
      <p className="truncate text-xs text-neutral-400">{hover ? hover.name : 'Visitors'}</p>
    </div>
  )
}
