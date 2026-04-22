'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import { useAuth } from '@/lib/auth/context'
import { useSites } from '@/lib/swr/sites'
import { XIcon, CheckCircleIcon } from '@ciphera-net/ui'
import { Circle as CircleIcon, CaretDown } from '@phosphor-icons/react'

interface ChecklistItem {
  key: string
  label: string
  href?: string
  check: () => boolean
}

const DISMISSED_KEY = 'pulse_checklist_dismissed'

export default function GettingStartedChecklist() {
  const { user } = useAuth()
  const { sites } = useSites()
  const [dismissed, setDismissed] = useState(true)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    setDismissed(localStorage.getItem(DISMISSED_KEY) === 'true')
  }, [])

  const items: ChecklistItem[] = [
    { key: 'org', label: 'Create workspace', check: () => !!user?.org_id },
    { key: 'site', label: 'Add your first site', href: '/sites/new', check: () => sites.length > 0 },
    { key: 'teammate', label: 'Invite a teammate', href: '/org-settings', check: () => false },
  ]

  const completedCount = items.filter(i => i.check()).length
  const allDone = completedCount === items.length

  if (dismissed || allDone) return null

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation()
    localStorage.setItem(DISMISSED_KEY, 'true')
    setDismissed(true)
  }

  const progress = (completedCount / items.length) * 100

  return (
    <div className="mb-4">
      {/* Compact bar */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl border border-neutral-800 bg-neutral-900/50 hover:bg-neutral-800/50 transition-colors group"
      >
        <span className="text-xs font-semibold text-white whitespace-nowrap">Getting Started</span>

        {/* Progress bar */}
        <div className="flex-1 h-1.5 bg-neutral-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-brand-orange rounded-full transition-all duration-500 ease-apple"
            style={{ width: `${progress}%` }}
          />
        </div>

        <span className="text-xs text-neutral-500 tabular-nums whitespace-nowrap">{completedCount}/{items.length}</span>

        <CaretDown
          className={`w-3.5 h-3.5 text-neutral-500 transition-transform ease-apple ${expanded ? 'rotate-180' : ''}`}
          weight="bold"
        />

        <div
          role="button"
          tabIndex={0}
          onClick={handleDismiss}
          onKeyDown={(e) => { if (e.key === 'Enter') handleDismiss(e as unknown as React.MouseEvent) }}
          className="text-neutral-600 hover:text-neutral-400 p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
          aria-label="Dismiss"
        >
          <XIcon className="h-3.5 w-3.5" />
        </div>
      </button>

      {/* Expandable items */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="flex items-center gap-4 px-4 py-3 mt-1 rounded-xl border border-neutral-800 bg-neutral-900/30">
              {items.map((item) => {
                const done = item.check()
                const inner = (
                  <div className={`flex items-center gap-1.5 text-xs ${done ? 'text-neutral-500' : 'text-neutral-300 hover:text-white'}`}>
                    {done ? (
                      <CheckCircleIcon className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                    ) : (
                      <CircleIcon className="h-3.5 w-3.5 text-neutral-600 shrink-0" />
                    )}
                    <span className={done ? 'line-through' : ''}>{item.label}</span>
                  </div>
                )

                if (item.href && !done) {
                  return <Link key={item.key} href={item.href}>{inner}</Link>
                }
                return <div key={item.key}>{inner}</div>
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
