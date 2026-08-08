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
 * column carries the primary top edge; the competitor column is muted.
 *
 * TWO renderings, because a three-column comparison cannot survive a phone.
 * The table is `min-w-[560px]`; at 390px that left the label column and Pulse
 * visible and pushed the COMPETITOR column — half the reason the page exists —
 * entirely off-screen inside a scroller with no visible affordance. Below sm we
 * render the same data as a stacked per-row comparison; sm+ keeps the table
 * exactly as it was.
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
    <>
      {/* ── phone: stacked comparison ── */}
      <div className="mt-10 border border-border sm:hidden">
        <div className="flex items-center gap-3 border-b border-border px-5 py-4">
          <span aria-hidden="true" className="h-[3px] w-6 bg-primary" />
          <span className="text-sm font-bold text-foreground">Pulse</span>
          <span className="text-xs text-muted-foreground">vs</span>
          <span className="text-sm font-bold text-muted-foreground">{competitor}</span>
        </div>
        <dl>
          {rows.map((row) => (
            <div key={row.label} className="border-b border-border px-5 py-4 last:border-b-0">
              <dt className="mb-3 text-xs text-muted-foreground">{row.label}</dt>
              <dd className="space-y-3">
                <div className="border-l-2 border-primary pl-3">
                  <span className="mb-1 block text-xs font-bold text-foreground">Pulse</span>
                  <Cell cell={row.pulse} emphasis />
                </div>
                <div className="border-l-2 border-border pl-3">
                  <span className="mb-1 block text-xs font-bold text-muted-foreground">{competitor}</span>
                  <Cell cell={row.them} />
                </div>
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {/* ── sm+: the original table, untouched ── */}
      <div className="mt-10 hidden overflow-x-auto border border-border sm:block">
      <table className="w-full min-w-[560px] border-collapse text-left">
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className="w-[28%] px-5 py-4 text-xs font-normal text-muted-foreground">
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
                className="px-5 py-4 text-xs font-normal text-muted-foreground"
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
    </>
  )
}
