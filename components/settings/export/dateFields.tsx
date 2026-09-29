'use client'

import { CalendarBlank } from '@phosphor-icons/react'
import { Input } from '@ciphera-net/facet'
import { cn } from '@/lib/utils'
import { isValidDateString } from '@/lib/hooks/periodUrl'
import type { DateSpan } from '@/lib/view/view'

// Settings → Export's custom range, shared by the Spreadsheet flow (PULSE-132)
// and the Growth report form (PULSE-133): two site-local days on the Audit
// tab's date field, and one rule for when they can be sent.

/** The Audit tab's date field: the native picker, its indicator stretched invisibly over a CalendarBlank. */
export const DATE_INPUT_CLASS = cn(
  'w-full pr-9 [color-scheme:dark] placeholder-shown:text-muted-foreground',
  '[&::-webkit-calendar-picker-indicator]:opacity-0',
  '[&::-webkit-calendar-picker-indicator]:absolute',
  '[&::-webkit-calendar-picker-indicator]:inset-0',
  '[&::-webkit-calendar-picker-indicator]:w-full',
  '[&::-webkit-calendar-picker-indicator]:cursor-pointer',
)

/** Why a custom range cannot be sent yet, or null when it can. `today` is the SITE's day. */
export function customRangeProblem(range: DateSpan | null, today: string): string | null {
  if (!range || !isValidDateString(range.start) || !isValidDateString(range.end)) return 'Choose a first and a last day.'
  if (range.start > range.end) return 'The last day comes before the first.'
  if (range.end > today) return 'Choose days up to today.'
  return null
}

/** The two day fields under a range picker's "Custom range…", with the problem beneath them. */
export function CustomRangeFields({
  value,
  onChange,
  today,
  problem,
}: {
  value: DateSpan | null
  onChange: (next: DateSpan) => void
  today: string
  problem: string | null
}) {
  return (
    <>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <div className="relative">
          <Input
            type="date"
            aria-label="First day"
            value={value?.start ?? ''}
            max={today}
            onChange={(e) => onChange({ start: e.target.value, end: value?.end ?? '' })}
            className={DATE_INPUT_CLASS}
          />
          <CalendarBlank className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        </div>
        <div className="relative">
          <Input
            type="date"
            aria-label="Last day"
            value={value?.end ?? ''}
            max={today}
            onChange={(e) => onChange({ start: value?.start ?? '', end: e.target.value })}
            className={DATE_INPUT_CLASS}
          />
          <CalendarBlank className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        </div>
      </div>
      {problem && (
        <p role="alert" className="mt-1.5 text-xs text-destructive">
          {problem}
        </p>
      )}
    </>
  )
}
