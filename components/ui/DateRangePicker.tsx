'use client'

import { useState, useRef, useEffect, useCallback, useId } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { CaretLeft, CaretRight, CalendarBlank, Check } from '@phosphor-icons/react'
import { CUSTOM_RANGE_LABEL } from '@/lib/constants/periods'
import type { DateSpan, RowState } from '@/lib/view/view'
import type { Period } from '@/lib/hooks/periodUrl'
import { buttonVariants } from '@ciphera-net/facet'
import { cn } from '@/lib/utils'

// ─── The view switcher (PULSE-20, owner decisions 25-09-2026) ────────────────
//
// ONE list, the same twelve rows on every page, no group headers, never scrolls; the
// calendar appears only behind "Custom range…", with a way back. A row with no data is
// GREYED with its reason (title, aria-describedby and the footnote) — never hidden, so
// the menu is one menu. The closed button says where the range runs past the data
// ("· since 26 Aug"), because that is where the range is read. The popover opens from
// the trigger's right edge on every page. Built to the approved mocks
// (Pulse/docs/data/25-09-2026-view-switcher-mocks/, direction A).
//
// The component decides nothing about data: useUrlDateRange (or the share page) hands
// it the rows, the label and the footnote from lib/view/view.ts, so the menu and the
// fetch come from one object and cannot drift.

export interface DateRangePickerProps {
  /** The closed button's label — the APPLIED view ("Last 7 days", "23 Sep"). */
  label: string
  /** The muted tail after the label ("since 26 Aug", "latest day"), or none. */
  suffix?: string | null
  /** The row that is ticked (the applied view), 'custom' for a custom range, or none. */
  tick: string | null
  /** The eleven named rows, in order, each available or greyed with its reason. */
  rows: RowState[]
  /** One muted line under the list — the greyed rows' reason, or a substitution. */
  footnote?: string | null
  onPick: (period: Period) => void
  /** Absent: "Custom range…" is greyed with `customReason` (the share page). */
  onCustom?: (range: DateSpan) => void
  customReason?: string
  /** Absent: no arrows (the share page). */
  onShift?: (direction: -1 | 1) => void
  shiftBackDisabled?: boolean
  shiftForwardDisabled?: boolean
  calendar?: {
    min?: string
    max: string
    maxDays: number
    caption?: string
    range: DateSpan
  }
  /** The page's wall clock — the calendar's initial month and its "today" ring. */
  now: Date
}

const ROW = 'flex items-center gap-2 w-full text-left px-3 py-1.5 text-sm transition-colors'
const ROW_ON = `${ROW} text-foreground`
const ROW_OFF = `${ROW} text-muted-foreground hover:text-foreground hover:bg-accent`
// The calendar's own unavailable-day class — the dominant "not available" device inside
// this exact control (the mocks asserted the greyed row paints the same colour).
const ROW_GREYED = `${ROW} text-muted-foreground/25 cursor-not-allowed`

function formatYMD(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function dayNumber(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number)
  return Date.UTC(y, m - 1, d) / 86_400_000
}

function getDaysForMonth(year: number, month: number) {
  const firstDay = new Date(year, month, 1)
  let startDay = firstDay.getDay() - 1
  if (startDay < 0) startDay = 6
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const days: { date: string; day: number; isCurrentMonth: boolean }[] = []

  const prevMonthDays = new Date(year, month, 0).getDate()
  for (let i = startDay - 1; i >= 0; i--) {
    const d = prevMonthDays - i
    const m = month === 0 ? 11 : month - 1
    const y = month === 0 ? year - 1 : year
    days.push({ date: formatYMD(y, m, d), day: d, isCurrentMonth: false })
  }
  for (let d = 1; d <= daysInMonth; d++) {
    days.push({ date: formatYMD(year, month, d), day: d, isCurrentMonth: true })
  }
  const remaining = 7 - (days.length % 7)
  if (remaining < 7) {
    for (let d = 1; d <= remaining; d++) {
      const m = month === 11 ? 0 : month + 1
      const y = month === 11 ? year + 1 : year
      days.push({ date: formatYMD(y, m, d), day: d, isCurrentMonth: false })
    }
  }
  return days
}

const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export default function DateRangePicker({
  label,
  suffix,
  tick,
  rows,
  footnote,
  onPick,
  onCustom,
  customReason,
  onShift,
  shiftBackDisabled = false,
  shiftForwardDisabled = false,
  calendar,
  now,
}: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [mode, setMode] = useState<'list' | 'calendar'>('list')
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const footnoteId = useId()

  const initial = calendar?.range.start ?? formatYMD(now.getFullYear(), now.getMonth(), now.getDate())
  const [viewMonth, setViewMonth] = useState(() => {
    const d = new Date(initial + 'T00:00:00')
    return { year: d.getFullYear(), month: d.getMonth() }
  })
  const [rangeStart, setRangeStart] = useState<string | null>(null)
  const [hoverDate, setHoverDate] = useState<string | null>(null)

  const todayStr = formatYMD(now.getFullYear(), now.getMonth(), now.getDate())

  // The popover opens from the trigger's RIGHT edge on every page (owner decision
  // 25-09-2026 — `align` was 'right' on four pages and 'left' on seven, with no rule).
  // Measured, not assumed: the panel is the list on sm+ and the viewport's width on a
  // phone, so its real width is read before clamping it on-screen.
  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const width = dropdownRef.current?.offsetWidth ?? Math.min(460, window.innerWidth - 16)
    let left = rect.right - width
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8))
    let top = rect.bottom + 6
    if (dropdownRef.current) {
      const maxTop = window.innerHeight - dropdownRef.current.offsetHeight - 8
      top = Math.min(top, Math.max(8, maxTop))
    }
    setPos({ left, top })
  }, [])

  useEffect(() => {
    if (isOpen) {
      setMode('list')
      setRangeStart(null)
      const d = new Date(initial + 'T00:00:00')
      setViewMonth({ year: d.getFullYear(), month: d.getMonth() })
      updatePosition()
      requestAnimationFrame(() => updatePosition())
    }
  }, [isOpen, updatePosition, initial])

  // The list and the calendar are different sizes; re-anchor when the mode flips.
  useEffect(() => {
    if (isOpen) requestAnimationFrame(() => updatePosition())
  }, [mode, isOpen, updatePosition])

  useEffect(() => {
    if (!isOpen) return
    function handleClick(e: MouseEvent) {
      const target = e.target as Node
      if (
        triggerRef.current && !triggerRef.current.contains(target) &&
        dropdownRef.current && !dropdownRef.current.contains(target)
      ) {
        setIsOpen(false)
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setIsOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen])

  function prevMonth() {
    setViewMonth((v) => (v.month === 0 ? { year: v.year - 1, month: 11 } : { year: v.year, month: v.month - 1 }))
  }
  function nextMonth() {
    setViewMonth((v) => (v.month === 11 ? { year: v.year + 1, month: 0 } : { year: v.year, month: v.month + 1 }))
  }

  function handleRowClick(row: RowState) {
    if (!row.available) return
    setIsOpen(false)
    onPick(row.key)
  }

  // A day is out of bounds when it is after the page's newest day (or the future),
  // before its first day, or — once a start is chosen — would make a span longer than
  // the page can load. All render identically: there is nothing there to ask for.
  const isOutOfBounds = (date: string): boolean => {
    if (!calendar) return true
    if (date > calendar.max) return true
    if (calendar.min && date < calendar.min) return true
    if (rangeStart && Math.abs(dayNumber(date) - dayNumber(rangeStart)) + 1 > calendar.maxDays) return true
    return false
  }

  function handleDayClick(date: string) {
    if (isOutOfBounds(date) || !onCustom) return
    if (!rangeStart) {
      setRangeStart(date)
      setHoverDate(null)
      return
    }
    let start = rangeStart
    let end = date
    if (end < start) [start, end] = [end, start]
    setRangeStart(null)
    setHoverDate(null)
    setIsOpen(false)
    onCustom({ start, end })
  }

  const effectiveStart = rangeStart ?? calendar?.range.start ?? todayStr
  const effectiveEnd = rangeStart ? (hoverDate ?? rangeStart) : (calendar?.range.end ?? todayStr)
  const [resolvedStart, resolvedEnd] = effectiveStart <= effectiveEnd
    ? [effectiveStart, effectiveEnd]
    : [effectiveEnd, effectiveStart]

  function getDayClass(date: string, isCurrentMonth: boolean): string {
    if (!isCurrentMonth) return 'text-muted-foreground/40'
    if (isOutOfBounds(date)) return 'text-muted-foreground/25 cursor-not-allowed'
    if (date === resolvedStart || date === resolvedEnd) return 'bg-primary text-primary-foreground'
    if (date > resolvedStart && date < resolvedEnd) return 'bg-primary/10 text-foreground'
    if (date === todayStr) return 'ring-1 ring-primary/50 text-foreground'
    return 'text-foreground hover:bg-accent'
  }

  const days = getDaysForMonth(viewMonth.year, viewMonth.month)
  const sections: RowState[][] = [
    rows.filter((r) => r.section === 'relative'),
    rows.filter((r) => r.section === 'calendar'),
  ]
  const customAvailable = Boolean(onCustom && calendar)

  const renderRow = (row: RowState) => {
    const ticked = tick === row.key
    if (!row.available) {
      return (
        <button
          key={row.key}
          type="button"
          disabled
          aria-disabled="true"
          title={row.reason}
          aria-describedby={footnote ? footnoteId : undefined}
          data-row={row.key}
          className={ROW_GREYED}
        >
          <Check weight="bold" className="w-3.5 h-3.5 shrink-0 opacity-0" />
          {row.label}
        </button>
      )
    }
    return (
      <button
        key={row.key}
        type="button"
        onClick={() => handleRowClick(row)}
        aria-pressed={ticked}
        data-row={row.key}
        className={ticked ? ROW_ON : ROW_OFF}
      >
        <Check weight="bold" className={`w-3.5 h-3.5 shrink-0 ${ticked ? 'opacity-100' : 'opacity-0'}`} />
        {row.label}
      </button>
    )
  }

  const list = (
    <div className="w-full py-2" data-view-list="">
      {sections.map((section, i) => (
        <div key={i} className={i > 0 ? 'mt-1.5 border-t border-border pt-1.5' : undefined}>
          {section.map(renderRow)}
        </div>
      ))}
      <div className="mt-1.5 border-t border-border pt-1.5">
        {customAvailable ? (
          <button
            type="button"
            onClick={() => setMode('calendar')}
            aria-pressed={tick === 'custom'}
            data-row="custom"
            className={tick === 'custom' ? ROW_ON : ROW_OFF}
          >
            <Check weight="bold" className={`w-3.5 h-3.5 shrink-0 ${tick === 'custom' ? 'opacity-100' : 'opacity-0'}`} />
            {CUSTOM_RANGE_LABEL}
          </button>
        ) : (
          <button
            type="button"
            disabled
            aria-disabled="true"
            title={customReason}
            aria-describedby={footnote ? footnoteId : undefined}
            data-row="custom"
            className={ROW_GREYED}
          >
            <Check weight="bold" className="w-3.5 h-3.5 shrink-0 opacity-0" />
            {CUSTOM_RANGE_LABEL}
          </button>
        )}
      </div>
      {footnote && (
        <div className="px-3">
          <p id={footnoteId} className="mt-3 border-t border-border pt-3 text-[11px] leading-snug text-muted-foreground/70">
            {footnote}
          </p>
        </div>
      )}
    </div>
  )

  const calendarView = calendar && (
    <div className="w-full p-3" data-view-calendar="">
      <div className="mb-3 flex items-center gap-2 border-b border-border pb-3">
        <button
          type="button"
          onClick={() => {
            setRangeStart(null)
            setMode('list')
          }}
          aria-label="Back to ranges"
          className="p-1 rounded-none text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <CaretLeft weight="bold" className="w-3.5 h-3.5" />
        </button>
        <span className="text-sm font-medium text-foreground">Custom range</span>
      </div>
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          onClick={prevMonth}
          aria-label="Previous month"
          className="p-1 rounded-none text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <CaretLeft weight="bold" className="w-3.5 h-3.5" />
        </button>
        <span className="text-sm font-medium text-foreground">
          {monthNames[viewMonth.month]} {viewMonth.year}
        </span>
        <button
          type="button"
          onClick={nextMonth}
          aria-label="Next month"
          className="p-1 rounded-none text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <CaretRight weight="bold" className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="grid grid-cols-7 mb-1">
        {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d) => (
          <div key={d} className="text-center text-[11px] font-medium text-muted-foreground/70 py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day, i) => (
          <button
            key={i}
            type="button"
            disabled={!day.isCurrentMonth || isOutOfBounds(day.date)}
            onClick={() => handleDayClick(day.date)}
            onMouseEnter={() => rangeStart && setHoverDate(day.date)}
            className={`flex h-11 w-full items-center justify-center text-sm transition-colors sm:h-9 sm:w-9 ${getDayClass(day.date, day.isCurrentMonth)}`}
          >
            {day.day}
          </button>
        ))}
      </div>
      {calendar.caption && (
        <p className="mt-3 border-t border-border pt-3 text-[11px] leading-snug text-muted-foreground/70">
          {calendar.caption}
        </p>
      )}
    </div>
  )

  const dropdown = (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={dropdownRef}
          initial={{ opacity: 0, y: 4, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 4, scale: 0.98 }}
          transition={{ duration: 0.15 }}
          data-view-switcher=""
          className={cn(
            'fixed z-50 flex w-[min(460px,calc(100vw-16px))] flex-col overflow-hidden rounded-none border border-border bg-popover shadow-lg',
            mode === 'list' ? 'sm:w-44' : 'sm:w-[280px]',
          )}
          style={pos ? { left: pos.left, top: pos.top } : undefined}
        >
          {mode === 'list' ? list : calendarView}
        </motion.div>
      )}
    </AnimatePresence>
  )

  const ariaLabel = `Date range: ${label}${suffix ? `, ${suffix}` : ''}`

  return (
    <div className="flex items-center gap-1.5">
      {/* Facet's chrome/toolbar classes are the base for all three controls — one source
          for the hairline look, and the system focus ring. */}
      {onShift && (
        <button
          type="button"
          onClick={() => onShift(-1)}
          disabled={shiftBackDisabled}
          aria-label="Shift range back"
          className={cn(buttonVariants({ variant: 'chrome', size: 'toolbar-icon' }), 'text-muted-foreground ease-apple hover:text-foreground disabled:opacity-40 disabled:pointer-events-none')}
        >
          <CaretLeft weight="bold" />
        </button>
      )}

      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        data-tour="date-range-picker"
        // The visible label alone names a RANGE, not the control — assistive tech (and
        // the product tour) get what the control IS.
        aria-label={ariaLabel}
        aria-expanded={isOpen}
        className={cn(buttonVariants({ variant: 'chrome', size: 'toolbar' }), 'font-normal ease-apple')}
      >
        <CalendarBlank className="text-muted-foreground" />
        <span>{label}</span>
        {suffix && <span className="text-muted-foreground" data-view-suffix="">· {suffix}</span>}
        <CaretRight weight="bold" className={`text-muted-foreground/70 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
      </button>

      {onShift && (
        <button
          type="button"
          onClick={() => onShift(1)}
          disabled={shiftForwardDisabled}
          aria-label="Shift range forward"
          className={cn(buttonVariants({ variant: 'chrome', size: 'toolbar-icon' }), 'text-muted-foreground ease-apple hover:text-foreground disabled:opacity-40 disabled:pointer-events-none')}
        >
          <CaretRight weight="bold" />
        </button>
      )}

      {typeof document !== 'undefined' && createPortal(dropdown, document.body)}
    </div>
  )
}
