'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { CaretLeft, CaretRight, CalendarBlank, Check } from '@phosphor-icons/react'
import { PERIOD_PRESETS, PERIOD_GROUPS, findPreset, type PeriodPreset } from '@/lib/constants/periods'
import { isUrlPeriod } from '@/lib/hooks/periodUrl'
import { buttonVariants } from '@ciphera-net/facet'
import { cn } from '@/lib/utils'

interface DateRangePickerProps {
  period: string
  dateRange: { start: string; end: string }
  onPeriodChange: (period: string) => void
  onDateRangeChange: (range: { start: string; end: string }) => void
  onShift?: (direction: -1 | 1) => void
  align?: 'left' | 'right'
  // * Page-scoped presets (e.g. the Search page's GSC ranges) rendered as
  // * their own group ABOVE the global ones, and resolved for the trigger
  // * label + checkmark — without leaking into every other page's picker.
  // * With `exclusive`, the global preset groups are NOT rendered at all —
  // * for pages whose data source has its own vocabulary and where global
  // * presets are dishonest (e.g. "Today" on a daily-only, 2-day-lagged
  // * source). Custom and the calendar always remain; an inherited URL
  // * period outside the list still resolves for the trigger label.
  extraPresets?: { group: string; presets: PeriodPreset[]; exclusive?: boolean }
  // * Preset keys this page cannot honestly serve (e.g. '1h'/'24h' on a
  // * date-granular API, where "Last hour" would silently mean "today").
  excludePresets?: string[]
}

function formatRangeDisplay(start: string, end: string): string {
  const s = new Date(start + 'T00:00:00')
  const e = new Date(end + 'T00:00:00')
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  if (start === end) {
    return `${months[s.getMonth()]} ${s.getDate()}, ${s.getFullYear()}`
  }
  if (s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth()) {
    return `${months[s.getMonth()]} ${s.getDate()} – ${e.getDate()}, ${e.getFullYear()}`
  }
  if (s.getFullYear() === e.getFullYear()) {
    return `${months[s.getMonth()]} ${s.getDate()} – ${months[e.getMonth()]} ${e.getDate()}, ${e.getFullYear()}`
  }
  return `${months[s.getMonth()]} ${s.getDate()}, ${s.getFullYear()} – ${months[e.getMonth()]} ${e.getDate()}, ${e.getFullYear()}`
}

function formatYMD(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function getDaysForMonth(year: number, month: number) {
  const firstDay = new Date(year, month, 1)
  let startDay = firstDay.getDay() - 1
  if (startDay < 0) startDay = 6
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const days: { date: string; day: number; isCurrentMonth: boolean; isFuture: boolean }[] = []

  const prevMonthDays = new Date(year, month, 0).getDate()
  for (let i = startDay - 1; i >= 0; i--) {
    const d = prevMonthDays - i
    const m = month === 0 ? 11 : month - 1
    const y = month === 0 ? year - 1 : year
    days.push({ date: formatYMD(y, m, d), day: d, isCurrentMonth: false, isFuture: false })
  }

  const today = new Date()
  const todayStr = formatYMD(today.getFullYear(), today.getMonth(), today.getDate())
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = formatYMD(year, month, d)
    days.push({ date: dateStr, day: d, isCurrentMonth: true, isFuture: dateStr > todayStr })
  }

  const remaining = 7 - (days.length % 7)
  if (remaining < 7) {
    for (let d = 1; d <= remaining; d++) {
      const m = month === 11 ? 0 : month + 1
      const y = month === 11 ? year + 1 : year
      days.push({ date: formatYMD(y, m, d), day: d, isCurrentMonth: false, isFuture: false })
    }
  }

  return days
}

const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December']

export default function DateRangePicker({
  period,
  dateRange,
  onPeriodChange,
  onDateRangeChange,
  onShift,
  align = 'left',
  extraPresets,
  excludePresets,
}: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  const [viewMonth, setViewMonth] = useState(() => {
    const d = new Date(dateRange.start + 'T00:00:00')
    return { year: d.getFullYear(), month: d.getMonth() }
  })
  const [rangeStart, setRangeStart] = useState<string | null>(null)
  const [hoverDate, setHoverDate] = useState<string | null>(null)

  const today = new Date()
  const todayStr = formatYMD(today.getFullYear(), today.getMonth(), today.getDate())

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    // The panel is 460px wide side-by-side, but below sm it stacks and shrinks to
    // the viewport (see the `w-[min(...)]` on the panel). Clamping against a
    // hard-coded 460 on a 390px phone yielded left=8 for a 456px-wide panel —
    // i.e. ~74px of the calendar hanging off-screen, unreachable. Measure the
    // width the panel can ACTUALLY take before clamping.
    const dropdownWidth = Math.min(460, window.innerWidth - 16)
    let left = align === 'right' ? rect.right - dropdownWidth : rect.left
    left = Math.max(8, Math.min(left, window.innerWidth - dropdownWidth - 8))
    let top = rect.bottom + 6
    if (dropdownRef.current) {
      const maxTop = window.innerHeight - dropdownRef.current.offsetHeight - 8
      top = Math.min(top, Math.max(8, maxTop))
    }
    setPos({ left, top })
  }, [align])

  useEffect(() => {
    if (isOpen) {
      const d = new Date(dateRange.start + 'T00:00:00')
      setViewMonth({ year: d.getFullYear(), month: d.getMonth() })
      updatePosition()
      requestAnimationFrame(() => updatePosition())
    }
  }, [isOpen, updatePosition, dateRange.start])

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
    setViewMonth(v => {
      if (v.month === 0) return { year: v.year - 1, month: 11 }
      return { year: v.year, month: v.month - 1 }
    })
  }

  function nextMonth() {
    setViewMonth(v => {
      if (v.month === 11) return { year: v.year + 1, month: 0 }
      return { year: v.year, month: v.month + 1 }
    })
  }

  const resolvePreset = (key: string) =>
    extraPresets?.presets.find((p) => p.key === key) ?? findPreset(key)

  function handlePresetClick(key: string) {
    const preset = resolvePreset(key)
    if (!preset) return
    const range = preset.resolve()
    setRangeStart(null)
    const d = new Date(range.start + 'T00:00:00')
    setViewMonth({ year: d.getFullYear(), month: d.getMonth() })
    setTimeout(() => {
      onPeriodChange(key)
      // * A URL-round-trippable preset writes ONLY the period — firing the
      // * range callback too made every preset click land as
      // * ?period=custom&start=…&end=… on pages that wire it to a custom
      // * write: the label degraded to a date span, no checkmark ever showed,
      // * and a shared link froze instead of rolling forward. Keys that can't
      // * live in the URL keep the double write so they still work at all.
      if (!isUrlPeriod(key)) {
        onDateRangeChange(range)
      }
      setIsOpen(false)
    }, 150)
  }

  function handleCustomClick() {
    setRangeStart(null)
  }

  function handleDayClick(date: string) {
    if (!rangeStart) {
      setRangeStart(date)
      setHoverDate(null)
    } else {
      let start = rangeStart
      let end = date
      if (end < start) [start, end] = [end, start]
      setRangeStart(null)
      setHoverDate(null)
      onPeriodChange('custom')
      onDateRangeChange({ start, end })
      setIsOpen(false)
    }
  }

  const effectiveStart = rangeStart ?? dateRange.start
  const effectiveEnd = rangeStart ? (hoverDate ?? rangeStart) : dateRange.end
  const [resolvedStart, resolvedEnd] = effectiveStart <= effectiveEnd
    ? [effectiveStart, effectiveEnd]
    : [effectiveEnd, effectiveStart]

  function getDayClass(date: string, day: { isCurrentMonth: boolean; isFuture: boolean }): string {
    if (!day.isCurrentMonth) return 'text-muted-foreground/40'
    if (day.isFuture) return 'text-muted-foreground/25 cursor-not-allowed'

    const isStart = date === resolvedStart
    const isEnd = date === resolvedEnd
    const isInRange = resolvedStart && resolvedEnd && date > resolvedStart && date < resolvedEnd
    const isToday = date === todayStr

    if (isStart || isEnd) return 'bg-primary text-primary-foreground'
    if (isInRange) return 'bg-primary/10 text-foreground'
    if (isToday) return 'ring-1 ring-primary/50 text-foreground'
    return 'text-foreground hover:bg-accent'
  }

  const days = getDaysForMonth(viewMonth.year, viewMonth.month)

  const displayLabel = period !== 'custom'
    ? (resolvePreset(period)?.label ?? 'Custom')
    : formatRangeDisplay(dateRange.start, dateRange.end)

  const endDate = new Date(dateRange.end + 'T00:00:00')
  const isForwardDisabled = endDate >= today

  const dropdown = (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={dropdownRef}
          initial={{ opacity: 0, y: 4, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 4, scale: 0.98 }}
          transition={{ duration: 0.15 }}
          className="fixed z-50 flex w-[min(460px,calc(100vw-16px))] flex-col rounded-none border border-border bg-popover shadow-lg overflow-hidden sm:w-auto sm:flex-row"
          style={pos ? { left: pos.left, top: pos.top } : undefined}
        >
          <div className="w-full max-h-[240px] border-b border-border py-2 overflow-y-auto sm:max-h-[400px] sm:w-44 sm:border-b-0 sm:border-r">
            {extraPresets && (
              <div>
                <div className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  {extraPresets.group}
                </div>
                {extraPresets.presets.map((preset) => (
                  <button
                    key={preset.key}
                    onClick={() => handlePresetClick(preset.key)}
                    className={`flex items-center gap-2 w-full text-left px-3 py-1.5 text-sm transition-colors ${
                      period === preset.key
                        ? 'text-foreground'
                        : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                    }`}
                  >
                    <Check
                      weight="bold"
                      className={`w-3.5 h-3.5 shrink-0 ${period === preset.key ? 'opacity-100' : 'opacity-0'}`}
                    />
                    {preset.label}
                  </button>
                ))}
              </div>
            )}
            {!extraPresets?.exclusive && PERIOD_GROUPS.filter((group) =>
              PERIOD_PRESETS.some(p => p.group === group && !excludePresets?.includes(p.key))
            ).map((group) => (
              <div key={group}>
                <div className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  {group}
                </div>
                {PERIOD_PRESETS.filter(p => p.group === group && !excludePresets?.includes(p.key)).map((preset) => (
                  <button
                    key={preset.key}
                    onClick={() => handlePresetClick(preset.key)}
                    className={`flex items-center gap-2 w-full text-left px-3 py-1.5 text-sm transition-colors ${
                      period === preset.key
                        ? 'text-foreground'
                        : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                    }`}
                  >
                    <Check
                      weight="bold"
                      className={`w-3.5 h-3.5 shrink-0 ${period === preset.key ? 'opacity-100' : 'opacity-0'}`}
                    />
                    {preset.label}
                  </button>
                ))}
              </div>
            ))}
            <div>
              <div className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                Custom
              </div>
              <button
                onClick={() => handleCustomClick()}
                className={`flex items-center gap-2 w-full text-left px-3 py-1.5 text-sm transition-colors ${
                  period === 'custom'
                    ? 'text-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                }`}
              >
                <Check
                  weight="bold"
                  className={`w-3.5 h-3.5 shrink-0 ${period === 'custom' ? 'opacity-100' : 'opacity-0'}`}
                />
                Custom
              </button>
            </div>
          </div>

          <div className="w-full p-3 sm:w-[280px]">
            <div className="flex items-center justify-between mb-3">
              <button
                onClick={prevMonth}
                className="p-1 rounded-none text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <CaretLeft weight="bold" className="w-3.5 h-3.5" />
              </button>
              <span className="text-sm font-medium text-foreground">
                {monthNames[viewMonth.month]} {viewMonth.year}
              </span>
              <button
                onClick={nextMonth}
                className="p-1 rounded-none text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <CaretRight weight="bold" className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-7 mb-1">
              {['Mo','Tu','We','Th','Fr','Sa','Su'].map(d => (
                <div key={d} className="text-center text-[11px] font-medium text-muted-foreground/70 py-1">{d}</div>
              ))}
            </div>

            <div className="grid grid-cols-7">
              {days.map((day, i) => (
                <button
                  key={i}
                  disabled={day.isFuture || !day.isCurrentMonth}
                  onClick={() => handleDayClick(day.date)}
                  onMouseEnter={() => rangeStart && setHoverDate(day.date)}
                  className={`flex h-11 w-full items-center justify-center text-sm transition-colors sm:h-9 sm:w-9 ${getDayClass(day.date, day)}`}
                >
                  {day.day}
                </button>
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )

  return (
    <div className="flex items-center gap-1.5">
      {/* Facet's chrome/toolbar classes are the base for all three controls —
          one source for the hairline look, and they finally get the system
          focus ring (these buttons had NO keyboard focus state before). */}
      {onShift && (
        <button
          onClick={() => onShift(-1)}
          aria-label="Shift range back"
          className={cn(buttonVariants({ variant: 'chrome', size: 'toolbar-icon' }), 'text-muted-foreground ease-apple hover:text-foreground')}
        >
          <CaretLeft weight="bold" />
        </button>
      )}

      <button
        ref={triggerRef}
        onClick={() => setIsOpen(!isOpen)}
        className={cn(buttonVariants({ variant: 'chrome', size: 'toolbar' }), 'font-normal ease-apple')}
      >
        <CalendarBlank className="text-muted-foreground" />
        <span>{displayLabel}</span>
        <CaretRight weight="bold" className={`text-muted-foreground/70 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
      </button>

      {onShift && (
        <button
          onClick={() => onShift(1)}
          disabled={isForwardDisabled}
          aria-label="Shift range forward"
          className={cn(buttonVariants({ variant: 'chrome', size: 'toolbar-icon' }), 'text-muted-foreground ease-apple hover:text-foreground')}
        >
          <CaretRight weight="bold" />
        </button>
      )}

      {typeof document !== 'undefined' && createPortal(dropdown, document.body)}
    </div>
  )
}
