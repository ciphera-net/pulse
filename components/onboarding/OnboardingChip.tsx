'use client'

/**
 * @file Getting Started progress chip for the top bar: ring + count, with the
 * checklist as an anchored dropdown. Replaces the floating bottom-right pill.
 *
 * Mounted twice, same as NotificationCenter: GlassTopBar (hidden below md) and
 * ContentHeader (md:hidden). All state lives in useOnboarding()'s shared SWR
 * cache, so the two mounts cannot desync; the panel portals to document.body
 * with fixed positioning, the same escape-from-overflow pattern the bell uses.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import Link from 'next/link'
import { DURATION_FAST, EASE_APPLE } from '@/lib/motion'
import { useOnboarding } from '@/lib/hooks/useOnboarding'
import { XIcon, CheckCircleIcon } from '@ciphera-net/facet'
import { Circle as CircleIcon, LockSimple as LockSimpleIcon } from '@phosphor-icons/react'

const PANEL_WIDTH = 288 // w-72

function ProgressRing({ progress, size = 20 }: { progress: number; size?: number }) {
  const strokeWidth = 2.5
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (progress / 100) * circumference

  return (
    <svg width={size} height={size} className="rotate-[-90deg]" aria-hidden="true">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        className="text-neutral-800"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        className="text-brand-orange transition-all duration-700 ease-apple"
      />
    </svg>
  )
}

export default function OnboardingChip() {
  const { items, completedCount, total, visible, dismiss } = useOnboarding()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [fixedPos, setFixedPos] = useState<{ left: number; top: number } | null>(null)

  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return
    const rect = buttonRef.current.getBoundingClientRect()
    const left = Math.max(8, Math.min(rect.right - PANEL_WIDTH, window.innerWidth - PANEL_WIDTH - 8))
    let top = rect.bottom + 8
    if (panelRef.current) {
      const maxTop = window.innerHeight - panelRef.current.offsetHeight - 8
      top = Math.min(top, Math.max(8, maxTop))
    }
    setFixedPos({ left, top })
  }, [])

  useEffect(() => {
    if (open) updatePosition()
  }, [open, updatePosition])

  // Close on outside click or Escape — same contract as NotificationCenter.
  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node
      if (
        wrapRef.current && !wrapRef.current.contains(target) &&
        (!panelRef.current || !panelRef.current.contains(target))
      ) {
        setOpen(false)
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  if (!visible) return null

  const progress = (completedCount / total) * 100

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation()
    setOpen(false)
    dismiss()
  }

  const panel = (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={panelRef}
          id="onboarding-dropdown"
          role="dialog"
          aria-label="Getting started checklist"
          initial={{ opacity: 0, y: 10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.95 }}
          transition={{ duration: DURATION_FAST, ease: EASE_APPLE }}
          className="fixed w-72 bg-popover border border-border rounded-none overflow-hidden z-[100] origin-top-right"
          style={fixedPos ? { left: fixedPos.left, top: fixedPos.top } : undefined}
        >
          <div className="p-4 pb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-semibold text-white">Getting Started</span>
              <button
                type="button"
                onClick={handleDismiss}
                className="text-neutral-600 hover:text-neutral-400 p-0.5"
                aria-label="Dismiss getting started checklist"
              >
                <XIcon className="h-3.5 w-3.5" />
              </button>
            </div>
            <p className="text-xs text-neutral-500">{completedCount} of {total} completed</p>
          </div>

          <div className="h-1 bg-neutral-800">
            <div
              className="h-full bg-brand-orange rounded-r-full transition-all duration-500 ease-apple"
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className="p-3 space-y-1">
            {items.map((item) => {
              // A step with nowhere to go is LOCKED, not merely unfinished.
              // It used to render identically to a live row — same colour,
              // same hover — so day-0 readers clicked four rows that did
              // nothing. The lock, the muted text and the reason say why.
              const locked = !item.completed && !item.href
              const optional = item.countsTowardCompletion === false && !item.completed
              const inner = (
                <div className={`flex items-center gap-2.5 px-2 py-2 rounded-none text-sm transition-colors ${
                  item.completed
                    ? 'text-neutral-500'
                    : locked
                      ? 'text-neutral-600 cursor-default'
                      : 'text-neutral-300 hover:text-white hover:bg-neutral-800/50'
                }`}>
                  {item.completed ? (
                    <CheckCircleIcon className="h-4 w-4 text-emerald-400 shrink-0" />
                  ) : locked ? (
                    <LockSimpleIcon className="h-4 w-4 text-neutral-700 shrink-0" weight="fill" aria-hidden />
                  ) : (
                    <CircleIcon className="h-4 w-4 text-neutral-600 shrink-0" />
                  )}
                  <span className={item.completed ? 'line-through' : ''}>{item.label}</span>
                  {locked && item.lockedReason && (
                    <span className="ml-auto shrink-0 text-[11px] text-neutral-600">{item.lockedReason}</span>
                  )}
                  {optional && (
                    <span className="ml-auto shrink-0 rounded-none border border-neutral-800 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-neutral-500">
                      optional
                    </span>
                  )}
                </div>
              )

              if (item.href && !item.completed) {
                return <Link key={item.key} href={item.href} onClick={() => setOpen(false)}>{inner}</Link>
              }
              return <div key={item.key}>{inner}</div>
            })}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )

  return (
    <div className="relative" ref={wrapRef}>
      {/* h-11 below md for the 44px touch minimum (same treatment as the bell
          one button over); md:h-auto hands desktop back to the compact bar.
          The count is desktop-only — on the phone header the ring alone keeps
          the footprint icon-sized next to the truncating site name. */}
      <button
        ref={buttonRef}
        type="button"
        data-tour="onboarding-chip"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-controls={open ? 'onboarding-dropdown' : undefined}
        aria-label={`Getting started: ${completedCount} of ${total} steps completed`}
        className="relative flex h-11 items-center justify-center gap-1.5 px-2 text-neutral-400 hover:text-white rounded-none hover:bg-white/[0.06] transition-colors md:h-auto md:py-2"
      >
        <ProgressRing progress={progress} />
        <span className="hidden md:inline text-xs font-medium text-neutral-400 tabular-nums">
          {completedCount}/{total}
        </span>
      </button>

      {typeof document !== 'undefined' ? createPortal(panel, document.body) : panel}
    </div>
  )
}
