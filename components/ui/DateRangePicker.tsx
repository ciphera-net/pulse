'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { CaretLeft, CaretRight, CalendarBlank, Check } from '@phosphor-icons/react'
import { PERIOD_PRESETS, PERIOD_GROUPS, findPreset } from '@/lib/constants/periods'

interface DateRangePickerProps {
  period: string
  dateRange: { start: string; end: string }
  onPeriodChange: (period: string) => void
  onDateRangeChange: (range: { start: string; end: string }) => void
  onShift?: (direction: -1 | 1) => void
  align?: 'left' | 'right'
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
    const dropdownWidth = 460
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

  function handlePresetClick(key: string) {
    const preset = findPreset(key)
    if (!preset) return
    const range = preset.resolve()
    setRangeStart(null)
    const d = new Date(range.start + 'T00:00:00')
    setViewMonth({ year: d.getFullYear(), month: d.getMonth() })
    setTimeout(() => {
      onPeriodChange(key)
      onDateRangeChange(range)
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
    if (!day.isCurrentMonth) return 'text-neutral-700'
    if (day.isFuture) return 'text-neutral-800 cursor-not-allowed'

    const isStart = date === resolvedStart
    const isEnd = date === resolvedEnd
    const isInRange = resolvedStart && resolvedEnd && date > resolvedStart && date < resolvedEnd
    const isToday = date === todayStr

    if (isStart || isEnd) return 'bg-brand-orange text-white rounded-full'
    if (isInRange) return 'bg-brand-orange/10 text-neutral-200 rounded-full'
    if (isToday) return 'ring-1 ring-brand-orange/50 text-neutral-200 rounded-full'
    return 'text-neutral-300 hover:bg-neutral-800 rounded-full'
  }

  const days = getDaysForMonth(viewMonth.year, viewMonth.month)

  const displayLabel = period !== 'custom'
    ? (findPreset(period)?.label ?? 'Custom')
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
          className="fixed z-50 flex rounded-xl border border-neutral-800 bg-neutral-900 shadow-2xl shadow-black/50 overflow-hidden"
          style={pos ? { left: pos.left, top: pos.top } : undefined}
        >
          <div className="w-44 border-r border-neutral-800 py-2 overflow-y-auto max-h-[400px]">
            {PERIOD_GROUPS.map((group) => (
              <div key={group}>
                <div className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-600">
                  {group}
                </div>
                {PERIOD_PRESETS.filter(p => p.group === group).map((preset) => (
                  <button
                    key={preset.key}
                    onClick={() => handlePresetClick(preset.key)}
                    className={`flex items-center gap-2 w-full text-left px-3 py-1.5 text-sm transition-colors ${
                      period === preset.key
                        ? 'text-white'
                        : 'text-neutral-400 hover:text-white hover:bg-neutral-800/50'
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
              <div className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-600">
                Custom
              </div>
              <button
                onClick={() => handleCustomClick()}
                className={`flex items-center gap-2 w-full text-left px-3 py-1.5 text-sm transition-colors ${
                  period === 'custom'
                    ? 'text-white'
                    : 'text-neutral-400 hover:text-white hover:bg-neutral-800/50'
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

          <div className="w-[280px] p-3">
            <div className="flex items-center justify-between mb-3">
              <button
                onClick={prevMonth}
                className="p-1 rounded-md text-neutral-500 hover:text-white hover:bg-neutral-800 transition-colors"
              >
                <CaretLeft weight="bold" className="w-3.5 h-3.5" />
              </button>
              <span className="text-sm font-medium text-neutral-300">
                {monthNames[viewMonth.month]} {viewMonth.year}
              </span>
              <button
                onClick={nextMonth}
                className="p-1 rounded-md text-neutral-500 hover:text-white hover:bg-neutral-800 transition-colors"
              >
                <CaretRight weight="bold" className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-7 mb-1">
              {['Mo','Tu','We','Th','Fr','Sa','Su'].map(d => (
                <div key={d} className="text-center text-[11px] font-medium text-neutral-600 py-1">{d}</div>
              ))}
            </div>

            <div className="grid grid-cols-7">
              {days.map((day, i) => (
                <button
                  key={i}
                  disabled={day.isFuture || !day.isCurrentMonth}
                  onClick={() => handleDayClick(day.date)}
                  onMouseEnter={() => rangeStart && setHoverDate(day.date)}
                  className={`w-9 h-9 flex items-center justify-center text-sm transition-colors ${getDayClass(day.date, day)}`}
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
      {onShift && (
        <button
          onClick={() => onShift(-1)}
          className="h-10 w-10 flex items-center justify-center rounded-lg border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors ease-apple disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <CaretLeft weight="bold" className="w-3.5 h-3.5" />
        </button>
      )}

      <button
        ref={triggerRef}
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 h-10 px-4 rounded-lg border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 text-sm text-neutral-300 transition-colors ease-apple"
      >
        <CalendarBlank className="w-4 h-4 text-neutral-500" />
        <span>{displayLabel}</span>
        <CaretRight weight="bold" className={`w-3 h-3 text-neutral-600 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
      </button>

      {onShift && (
        <button
          onClick={() => onShift(1)}
          disabled={isForwardDisabled}
          className="h-10 w-10 flex items-center justify-center rounded-lg border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors ease-apple disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <CaretRight weight="bold" className="w-3.5 h-3.5" />
        </button>
      )}

      {typeof document !== 'undefined' && createPortal(dropdown, document.body)}
    </div>
  )
}
