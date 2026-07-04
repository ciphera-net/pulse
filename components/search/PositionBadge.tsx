import { cn } from '@/lib/utils'

// Average search position, mono + tabular so digits align down a column. Top of
// the first page (the displayed 1-decimal value ≤ 10.4, i.e. position < 10.5)
// earns brand orange; everything else stays neutral chrome. No emerald/red —
// distance from #1 is data, not a good/bad delta.
export function PositionBadge({ position }: { position: number }) {
  const topPage = position < 10.5
  return (
    <span
      className={cn(
        'rounded-none px-1.5 py-0.5 font-mono text-xs tabular-nums',
        topPage ? 'bg-brand-orange/10 text-brand-orange' : 'bg-neutral-800 text-neutral-300',
      )}
    >
      {position.toFixed(1)}
    </span>
  )
}
