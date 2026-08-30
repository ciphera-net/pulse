'use client'

import { useMemo } from 'react'

// ─── Signature device #3: the month ribbon (approved §9a, detail 2) ─
//
// The visitor's identity month, one cell per site-local day. An empty day is a
// hairline outline; an active day fills orange with opacity proportional to its
// visits; today carries a ring.
//
// It exists because this identity has a HORIZON. Rybbit draws a rolling
// four-month activity calendar, which it can because its identities persist
// indefinitely; ours are re-minted every calendar month, so a four-month
// calendar would be four different people's rows stacked without saying so. One
// month, ending in a stated reset, is the true shape.

interface MonthRibbonProps {
  /** 'YYYY-MM' — the identity's month. */
  month: string
  /** Visits per day-of-month (1-based keys). */
  visitsByDay: Record<number, number>
  /** Today's day-of-month, or null when today is not in this month. */
  today: number | null
  /** Days until the identity resets, or null when it already has. */
  resetsInDays: number | null
}

function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number)
  if (!y || !m) return 31
  return new Date(y, m, 0).getDate()
}

function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  if (!y || !m) return month
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long' })
}

export function MonthRibbon({ month, visitsByDay, today, resetsInDays }: MonthRibbonProps) {
  const total = daysInMonth(month)
  const max = useMemo(
    () => Math.max(1, ...Object.values(visitsByDay)),
    [visitsByDay],
  )

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-xs text-neutral-500">{monthLabel(month)}, day by day</span>
        {resetsInDays !== null && (
          <span className="text-xs text-neutral-500">
            identity resets in{' '}
            <span className="text-neutral-300">
              {resetsInDays} {resetsInDays === 1 ? 'day' : 'days'}
            </span>
          </span>
        )}
      </div>

      <div className="flex gap-1">
        {Array.from({ length: total }, (_, i) => {
          const day = i + 1
          const visits = visitsByDay[day] ?? 0
          const isToday = today === day
          return (
            <div
              key={day}
              title={`${day} ${monthLabel(month)} — ${visits} ${visits === 1 ? 'visit' : 'visits'}`}
              className={
                'h-6 flex-1 rounded-none ' +
                (visits > 0
                  ? 'bg-brand-orange'
                  : 'border border-border') +
                (isToday ? ' ring-1 ring-brand-orange ring-offset-1 ring-offset-background' : '')
              }
              // Opacity carries intensity so the ribbon has depth without a second
              // hue. A zero-visit day is NOT a faint orange — it is an outline, so
              // "no data" and "a little data" can never be confused.
              style={visits > 0 ? { opacity: 0.35 + 0.65 * (visits / max) } : undefined}
            />
          )
        })}
      </div>

      <div className="relative mt-1 h-4 text-xs text-neutral-600">
        {[1, 8, 15, 22, 29]
          .filter((d) => d <= total)
          .map((d) => (
            <span
              key={d}
              className="absolute tabular-nums"
              style={{ left: `${((d - 1) / total) * 100}%` }}
            >
              {d}
            </span>
          ))}
      </div>
    </div>
  )
}
