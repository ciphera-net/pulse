import Image from 'next/image'
import { cdnUrl } from '@/lib/cdn'
import { cn } from '@/lib/cn'
import type { ComparisonCell, ComparisonRow } from '@/lib/comparisons'

const TONE_DOT: Record<ComparisonCell['tone'], string> = {
  pos: 'bg-green-500',
  neg: 'bg-red-500',
  neutral: 'bg-muted-foreground/50',
}

function Cell({ cell, emphasis }: { cell: ComparisonCell; emphasis?: boolean }) {
  return (
    <div className="flex items-start gap-2.5">
      <span
        aria-hidden="true"
        className={cn('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', TONE_DOT[cell.tone])}
      />
      <span className={cn('text-sm leading-snug', emphasis ? 'text-foreground' : 'text-muted-foreground')}>
        {cell.text}
      </span>
    </div>
  )
}

/**
 * The above-the-fold verdict table for a /vs page: Pulse against one competitor
 * across the rows that actually decide a privacy-analytics choice. Pulse's
 * column carries the primary top edge; the competitor column is muted. Scrolls
 * horizontally inside its own container on narrow screens so the page body never
 * scrolls sideways.
 */
export function VerdictTable({
  competitor,
  competitorLogo,
  rows,
}: {
  competitor: string
  competitorLogo?: string
  rows: ComparisonRow[]
}) {
  return (
    <div className="mt-10 overflow-x-auto border border-border">
      <table className="w-full min-w-[560px] border-collapse text-left">
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className="w-[28%] px-5 py-4 font-mono text-xs font-normal text-muted-foreground">
              &nbsp;
            </th>
            <th scope="col" className="relative w-[36%] bg-card px-5 py-4">
              <span aria-hidden="true" className="absolute inset-x-0 top-0 h-[3px] bg-primary" />
              <span className="flex items-center gap-2">
                <Image
                  src={cdnUrl('/pulse_icon_no_margins.png')}
                  alt="Pulse"
                  width={20}
                  height={20}
                  unoptimized
                  className="h-5 w-5 object-contain"
                />
                <span className="text-sm font-bold text-foreground">Pulse</span>
              </span>
            </th>
            <th scope="col" className="w-[36%] px-5 py-4">
              <span className="flex items-center gap-2">
                {competitorLogo && (
                  <Image
                    src={competitorLogo}
                    alt={competitor}
                    width={20}
                    height={20}
                    unoptimized
                    className="h-5 w-5 rounded-sm object-contain"
                  />
                )}
                <span className="text-sm font-bold text-foreground">{competitor}</span>
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-b border-border last:border-b-0 align-top">
              <th
                scope="row"
                className="px-5 py-4 font-mono text-xs font-normal text-muted-foreground"
              >
                {row.label}
              </th>
              <td className="bg-card px-5 py-4">
                <Cell cell={row.pulse} emphasis />
              </td>
              <td className="px-5 py-4">
                <Cell cell={row.them} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
