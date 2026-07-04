'use client'

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { DURATION_FAST, EASE_APPLE } from '@/lib/motion'

// ---------------------------------------------------------------------------
// FilterPopover — the anchored surface the whole filter flow lives in.
// Positions below the anchor (Filter button or a pill), flips above when the
// viewport bottom is closer than the panel height, clamps horizontally, traps
// focus while open, and returns focus to the anchor on close.
// ---------------------------------------------------------------------------

const VIEWPORT_MARGIN = 16
const ANCHOR_GAP = 6

export interface FilterPopoverProps {
  open: boolean
  anchor: HTMLElement | null
  /** Accessible name — "Add filter" or "Edit filter". */
  label: string
  /** Changes when the visible stage changes so position/measure re-runs. */
  contentKey: string
  onClose: () => void
  children: ReactNode
}

export default function FilterPopover({ open, anchor, label, contentKey, onClose, children }: FilterPopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const [resizeTick, setResizeTick] = useState(0)
  const [contentHeight, setContentHeight] = useState<number | null>(null)
  const [isMorphing, setIsMorphing] = useState(false)

  // * Track the active stage's rendered height so the panel morphs between
  // * stage sizes (and grows smoothly when suggestions arrive) instead of
  // * snapping. Null until first measure — the initial open keeps its natural
  // * height with no morph.
  useEffect(() => {
    if (!open) {
      setContentHeight(null)
      return
    }
    const el = measureRef.current
    if (!el) return
    const observer = new ResizeObserver(() => setContentHeight(el.offsetHeight))
    observer.observe(el)
    setContentHeight(el.offsetHeight)
    return () => observer.disconnect()
  }, [open, contentKey])

  // * Position before paint: below the anchor, flipped above when it would
  // * overflow, clamped to the viewport with a fixed margin.
  useLayoutEffect(() => {
    if (!open || !anchor || !panelRef.current) return
    const a = anchor.getBoundingClientRect()
    const p = panelRef.current.getBoundingClientRect()

    let top = a.bottom + ANCHOR_GAP
    if (top + p.height > window.innerHeight - VIEWPORT_MARGIN) {
      const above = a.top - ANCHOR_GAP - p.height
      top = above >= VIEWPORT_MARGIN
        ? above
        : Math.max(VIEWPORT_MARGIN, window.innerHeight - VIEWPORT_MARGIN - p.height)
    }

    const left = Math.max(
      VIEWPORT_MARGIN,
      Math.min(a.left, window.innerWidth - VIEWPORT_MARGIN - p.width),
    )
    setPos({ left, top })
  }, [open, anchor, contentKey, resizeTick])

  useEffect(() => {
    if (!open) return
    const onResize = () => setResizeTick(t => t + 1)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [open])

  // * Focus in, trap Tab, close on Esc/outside, restore focus on close.
  useEffect(() => {
    if (!open) return
    const panel = panelRef.current
    const previouslyFocused = document.activeElement as HTMLElement | null

    const initial = panel?.querySelector<HTMLElement>('[data-autofocus]')
      ?? panel?.querySelector<HTMLElement>('input, button:not([disabled])')
    initial?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key !== 'Tab' || !panel) return
      const focusables = Array.from(
        panel.querySelectorAll<HTMLElement>('input, button:not([disabled]), [tabindex]:not([tabindex="-1"])'),
      ).filter(el => el.offsetParent !== null)
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (!panel?.contains(target) && !anchor?.contains(target)) onClose()
    }

    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
      previouslyFocused?.focus?.()
    }
  }, [open, anchor, onClose])

  useEffect(() => {
    if (!open) setPos(null)
  }, [open])

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {open && anchor && (
        <motion.div
          ref={panelRef}
          role="dialog"
          aria-label={label}
          initial={{ opacity: 0, y: 6, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 6, scale: 0.97 }}
          transition={{ duration: DURATION_FAST, ease: EASE_APPLE }}
          className="fixed z-[100] w-[360px] max-w-[calc(100vw-32px)] bg-popover border border-border rounded-none shadow-lg origin-top-left"
          // * Off-screen until the pre-paint measure runs — never a 0,0 flash.
          style={pos ?? { left: -9999, top: -9999 }}
        >
          <motion.div
            initial={false}
            animate={contentHeight != null ? { height: contentHeight } : undefined}
            transition={{ duration: DURATION_FAST, ease: EASE_APPLE }}
            onAnimationStart={() => setIsMorphing(true)}
            onAnimationComplete={() => setIsMorphing(false)}
            // * Clip only mid-morph — at rest the operator chip's menu must be
            // * free to overhang the panel.
            style={{ overflow: isMorphing ? 'hidden' : undefined }}
          >
            <div ref={measureRef}>
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.div
                  key={contentKey}
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  transition={{ duration: DURATION_FAST, ease: EASE_APPLE }}
                >
                  {children}
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
