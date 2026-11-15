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
import { panelSurface, useGlassPanels } from '@/lib/dashboard/frame'

// ─── The view switcher (PULSE-20, owner decisions 25-09-2026) ────────────────
//
// ONE list, the same twelve rows on every page, no group headers, never scrolls; the
// calendar appears only behind "Custom range…", and the same row closes it again. A row
// with no data is GREYED with its reason (title, aria-describedby and the footnote) —
// never hidden, so the menu is one menu. The closed button says where the range runs
// past the data ("· since 26 Aug"), because that is where the range is read. The popover
// opens from the trigger's right edge on every page. Built to the approved mocks
// (Pulse/docs/data/25-09-2026-view-switcher-mocks/, direction A).
//
// The component decides nothing about data: useUrlDateRange (or the share page) hands
// it the rows, the label and the footnote from lib/view/view.ts, so the menu and the
// fetch come from one object and cannot drift.
//
// ─── The calendar opens BESIDE the list (14-11-2026) ─────────────────────────
//
// It used to REPLACE the list: the panel changed its width and its height in one frame
// and was put back under the trigger a frame later, which showed as a jump. Now the list
// never moves. The panel is pinned by the edge the list sits on and the calendar's column
// grows away from it; the list is the taller of the two, so the height stays as well.
// Where the panel hangs is decided once, when it opens, for its WIDEST state
// (placePanel), so nothing is measured again when the calendar appears. Below `sm` there
// is no room for two columns: the calendar opens under the list and the panel scrolls to
// it.

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
// "Custom range…" while its calendar is open: the hovered row's look, held, so the row
// and the column beside it read as one thing.
const ROW_OPEN = `${ROW} text-foreground bg-accent`
// The calendar's own unavailable-day class — the dominant "not available" device inside
// this exact control (the mocks asserted the greyed row paints the same colour).
const ROW_GREYED = `${ROW} text-muted-foreground/25 cursor-not-allowed`

// The two columns from `sm` up. Each class draws a column and its number places the
// panel before the calendar exists, so a class and its number have to say the same
// width (the test reads both). The list keeps the panel at the 176 px it always had:
// 174 plus the panel's two border pixels.
export const LIST_COLUMN_PX = 174
const LIST_COLUMN = 'sm:w-[174px]'
export const CALENDAR_COLUMN_PX = 280
const CALENDAR_COLUMN = 'sm:w-[280px]'
/** The panel's own border, left plus right. */
const PANEL_BORDER_PX = 2
/** Tailwind's `sm`: from here up the calendar sits beside the list. */
const WIDE_QUERY = '(min-width: 640px)'
/** The least distance kept between the panel and the viewport's edges. */
const EDGE = 8

export interface PanelPlacement {
  /** The side of the list the calendar opens on. The panel is pinned by the opposite edge. */
  calendarSide: 'left' | 'right'
  /** Set when the calendar opens to the right: the panel's left edge, from the viewport's left. */
  left?: number
  /** Set when the calendar opens to the left: the panel's right edge, from the viewport's right. */
  right?: number
}

/**
 * Where the panel hangs. Decided ONCE, when it opens, and for its widest state, so that opening the
 * calendar later moves nothing.
 *
 * `list` is the panel's width with the list alone and `calendar` what the calendar's column adds to
 * it (0 where the calendar opens under the list). All in px; `triggerRight` is the trigger's right
 * edge from the viewport's left, `viewport` the width a fixed box is laid out in.
 */
export function placePanel({ triggerRight, viewport, list, calendar }: {
  triggerRight: number
  viewport: number
  list: number
  calendar: number
}): PanelPlacement {
  const full = list + calendar
  // The usual case: the list hangs from the trigger's right edge and the calendar opens to its left.
  const right = Math.max(EDGE, viewport - triggerRight)
  if (viewport - right - full >= EDGE) return { calendarSide: 'left', right }
  // No room on that side (a toolbar that wrapped to the start of its row): the list stays under the
  // trigger and the calendar opens to its right.
  const left = Math.max(EDGE, triggerRight - list)
  if (calendar > 0 && left + full <= viewport - EDGE) return { calendarSide: 'right', left }
  // Room on neither side: as close to the trigger as the whole panel fits.
  return { calendarSide: 'left', right: Math.max(EDGE, viewport - full - EDGE) }
}

/** A media query's answer, or `fallback` where there is no window to ask (the server, a test). */
function matchesMedia(query: string, fallback: boolean): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return fallback
  return window.matchMedia(query).matches
}

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
  const glass = useGlassPanels()
  const [isOpen, setIsOpen] = useState(false)
  const [calendarOpen, setCalendarOpen] = useState(false)
  // How the calendar arrives, read when it is asked for: beside the list its width grows,
  // under the list (below `sm`) its height does; with reduced motion it is simply there.
  const [arrival, setArrival] = useState({ stacked: false, instant: false })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<(PanelPlacement & { top: number }) | null>(null)
  const footnoteId = useId()
  const calendarId = useId()

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
  // Measured, not assumed: the panel is the list from `sm` up and the viewport's width on
  // a phone, so its real width is read before it is placed. The widths come from the
  // list, never from the panel's current width, so a call made while the calendar is
  // open still places the same box.
  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current
    if (!trigger) return
    const rect = trigger.getBoundingClientRect()
    // What a fixed box is laid out in: the viewport without a classic scrollbar. `right` is
    // counted from that edge, so the window's own width would be off by the scrollbar.
    const viewport = document.documentElement.clientWidth || window.innerWidth
    const panel = dropdownRef.current
    const wide = matchesMedia(WIDE_QUERY, true)
    const list = wide
      ? (listRef.current?.offsetWidth || LIST_COLUMN_PX) + PANEL_BORDER_PX
      : (panel?.offsetWidth || Math.min(460, viewport - 2 * EDGE))
    const placed = placePanel({
      triggerRight: rect.right,
      viewport,
      list,
      calendar: wide ? CALENDAR_COLUMN_PX : 0,
    })
    let top = rect.bottom + 6
    if (panel) {
      const maxTop = window.innerHeight - panel.offsetHeight - EDGE
      top = Math.min(top, Math.max(EDGE, maxTop))
    }
    setPos({ ...placed, top })
  }, [])

  useEffect(() => {
    if (isOpen) {
      setCalendarOpen(false)
      setRangeStart(null)
      const d = new Date(initial + 'T00:00:00')
      setViewMonth({ year: d.getFullYear(), month: d.getMonth() })
      updatePosition()
      requestAnimationFrame(() => updatePosition())
    }
  }, [isOpen, updatePosition, initial])

  // No second placement when the calendar opens or closes: the panel was placed for both
  // states, and measuring it again mid-change is what used to make it jump.

  function toggleCalendar() {
    if (calendarOpen) {
      // A half-picked range goes with the calendar.
      setRangeStart(null)
      setHoverDate(null)
      setCalendarOpen(false)
      return
    }
    setArrival({
      stacked: !matchesMedia(WIDE_QUERY, true),
      instant: matchesMedia('(prefers-reduced-motion: reduce)', false),
    })
    setCalendarOpen(true)
  }

  // Under the list the calendar can open past the panel's lower edge. While it grows (and
  // shrinks) the panel stays scrolled to its end, so the calendar comes up into view
  // instead of opening out of sight.
  function keepCalendarInView() {
    const panel = dropdownRef.current
    if (panel && panel.scrollHeight > panel.clientHeight) panel.scrollTop = panel.scrollHeight
  }

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
    <div ref={listRef} className={`w-full shrink-0 py-2 ${LIST_COLUMN}`} data-view-list="">
      {sections.map((section, i) => (
        <div key={i} className={i > 0 ? 'mt-1.5 border-t border-border pt-1.5' : undefined}>
          {section.map(renderRow)}
        </div>
      ))}
      <div className="mt-1.5 border-t border-border pt-1.5">
        {customAvailable ? (
          <button
            type="button"
            onClick={toggleCalendar}
            aria-pressed={tick === 'custom'}
            aria-expanded={calendarOpen}
            aria-controls={calendarOpen ? calendarId : undefined}
            data-row="custom"
            className={calendarOpen ? ROW_OPEN : tick === 'custom' ? ROW_ON : ROW_OFF}
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

  // The column and the calendar in it are two boxes on purpose. The outer one changes
  // size (its width beside the list, its height under it) and clips; the inner one keeps
  // the calendar's full width from the first frame, held against the list's side, so the
  // days never reflow while the column opens: the panel's edge moves, the calendar does not.
  const calendarToRight = pos?.calendarSide === 'right'
  const calendarView = calendar && (
    <motion.div
      key="calendar"
      id={calendarId}
      role="group"
      aria-label="Custom range"
      data-view-calendar=""
      // With reduced motion there is no first frame at zero size: the column starts as it ends.
      initial={arrival.instant ? false : arrival.stacked ? { height: 0, opacity: 0 } : { width: 0, opacity: 0 }}
      animate={arrival.stacked ? { height: 'auto', opacity: 1 } : { width: 'auto', opacity: 1 }}
      exit={arrival.stacked ? { height: 0, opacity: 0 } : { width: 0, opacity: 0 }}
      transition={{ duration: arrival.instant ? 0 : 0.2, ease: [0.32, 0.72, 0, 1] }}
      onUpdate={arrival.stacked ? keepCalendarInView : undefined}
      className={cn('flex shrink-0 overflow-hidden', calendarToRight ? 'sm:justify-start' : 'sm:justify-end')}
    >
      {/* The hairline towards the list is drawn INSIDE the 280 px, so the column is exactly the width the
          panel was placed for, and it stands beside the list from the first frame. */}
      <div
        className={cn(
          'w-full shrink-0 border-t border-border p-3 sm:border-t-0',
          CALENDAR_COLUMN,
          calendarToRight ? 'sm:border-l' : 'sm:border-r',
        )}
      >
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
    </motion.div>
  )

  // Pinned by the edge the list sits on: `right` when the calendar opens to the left (the
  // usual case), `left` when it opens to the right. The other edge is left to the content,
  // so the panel grows away from the list without being placed again. Its height is the
  // list's from `sm` up; under that it may reach the viewport's lower edge and scroll.
  const panelStyle = pos
    ? {
        top: pos.top,
        ...(pos.calendarSide === 'right' ? { left: pos.left } : { right: pos.right }),
        maxHeight: `calc(100dvh - ${pos.top + EDGE}px)`,
      }
    : undefined

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
          data-calendar-side={pos?.calendarSide}
          className={cn(
            'fixed z-50 flex w-[min(460px,calc(100vw-16px))] flex-col overflow-x-hidden overflow-y-auto overscroll-contain rounded-none shadow-lg sm:w-auto',
            panelSurface(glass),
            calendarToRight ? 'sm:flex-row' : 'sm:flex-row-reverse',
          )}
          style={panelStyle}
        >
          {list}
          <AnimatePresence initial={false}>{calendarOpen && calendarView}</AnimatePresence>
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
