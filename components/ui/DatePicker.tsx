'use client'

import React, { useState, useEffect } from 'react'
import { ChevronLeftIcon, ChevronRightIcon, Cross2Icon } from '@radix-ui/react-icons'

interface DateRange {
  start: string
  end: string
}

interface DatePickerProps {
  isOpen: boolean
  onClose: () => void
  onApply: (range: DateRange) => void
  initialRange: DateRange
}

export default function DatePicker({ isOpen, onClose, onApply, initialRange }: DatePickerProps) {
  const [startDate, setStartDate] = useState<Date>(new Date(initialRange.start))
  const [endDate, setEndDate] = useState<Date>(new Date(initialRange.end))
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date(initialRange.end))
  const [selectingStart, setSelectingStart] = useState(true)

  useEffect(() => {
    if (isOpen) {
      setStartDate(new Date(initialRange.start))
      setEndDate(new Date(initialRange.end))
      setCurrentMonth(new Date(initialRange.end))
    }
  }, [isOpen, initialRange])

  if (!isOpen) return null

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear()
    const month = date.getMonth()
    const days = new Date(year, month + 1, 0).getDate()
    const firstDay = new Date(year, month, 1).getDay()
    return { days, firstDay }
  }

  const { days, firstDay } = getDaysInMonth(currentMonth)

  const handleDateClick = (day: number) => {
    const clickedDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day)
    
    if (selectingStart) {
      setStartDate(clickedDate)
      // If clicked date is after current end date, reset end date
      if (clickedDate > endDate) {
        setEndDate(clickedDate)
      }
      setSelectingStart(false)
    } else {
      if (clickedDate < startDate) {
        setStartDate(clickedDate)
        setSelectingStart(false) // Keep selecting start effectively if they clicked before start
      } else {
        setEndDate(clickedDate)
        setSelectingStart(true) // Reset to start for next interaction or just done
      }
    }
  }

  const handleMonthChange = (increment: number) => {
    const newMonth = new Date(currentMonth)
    newMonth.setMonth(newMonth.getMonth() + increment)
    setCurrentMonth(newMonth)
  }

  const formatDate = (date: Date) => date.toISOString().split('T')[0]

  const isSelected = (day: number) => {
    const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day)
    return (
      date.getTime() === startDate.getTime() ||
      date.getTime() === endDate.getTime()
    )
  }

  const isInRange = (day: number) => {
    const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day)
    return date > startDate && date < endDate
  }

  const isToday = (day: number) => {
    const today = new Date()
    const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day)
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-2xl border border-neutral-200 dark:border-neutral-800 w-full max-w-md p-6 animate-in fade-in zoom-in duration-200">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">Select Date Range</h2>
          <button onClick={onClose} className="text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition-colors">
            <Cross2Icon className="w-5 h-5" />
          </button>
        </div>

        <div className="mb-6 flex items-center justify-between bg-neutral-50 dark:bg-neutral-800 p-3 rounded-lg">
          <button onClick={() => handleMonthChange(-1)} className="p-1 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-md transition-colors">
            <ChevronLeftIcon className="w-5 h-5" />
          </button>
          <span className="font-medium text-neutral-900 dark:text-white">
            {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </span>
          <button onClick={() => handleMonthChange(1)} className="p-1 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-md transition-colors">
            <ChevronRightIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 mb-2 text-center text-xs font-medium text-neutral-500 uppercase tracking-wider">
          {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => (
            <div key={day}>{day}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1 mb-6">
          {Array.from({ length: firstDay }).map((_, i) => (
            <div key={`empty-${i}`} />
          ))}
          {Array.from({ length: days }).map((_, i) => {
            const day = i + 1
            const selected = isSelected(day)
            const inRange = isInRange(day)
            const today = isToday(day)

            return (
              <button
                key={day}
                onClick={() => handleDateClick(day)}
                className={`
                  h-9 w-9 rounded-full text-sm font-medium flex items-center justify-center transition-all
                  ${selected 
                    ? 'bg-brand-orange text-white shadow-md shadow-brand-orange/20' 
                    : inRange
                    ? 'bg-orange-50 dark:bg-orange-900/20 text-brand-orange'
                    : 'hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-900 dark:text-white'
                  }
                  ${today && !selected && !inRange ? 'ring-1 ring-brand-orange text-brand-orange' : ''}
                `}
              >
                {day}
              </button>
            )
          })}
        </div>

        <div className="flex items-center justify-between gap-4 pt-4 border-t border-neutral-200 dark:border-neutral-800">
          <div className="text-sm text-neutral-500">
            <span className={selectingStart ? 'text-brand-orange font-medium' : ''}>
              {startDate.toLocaleDateString()}
            </span>
            {' - '}
            <span className={!selectingStart ? 'text-brand-orange font-medium' : ''}>
              {endDate.toLocaleDateString()}
            </span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => onApply({ start: formatDate(startDate), end: formatDate(endDate) })}
              className="px-4 py-2 text-sm font-medium bg-brand-orange text-white rounded-lg shadow-sm hover:bg-orange-600 transition-colors"
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
