'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import { useAuth } from '@/lib/auth/context'
import { useSites } from '@/lib/swr/sites'
import { XIcon, CheckCircleIcon } from '@ciphera-net/ui'
import { Circle as CircleIcon, Rocket } from '@phosphor-icons/react'

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
  const nextItem = items.find(i => !i.check())

  return (
    <div className="fixed bottom-5 right-5 z-40">
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-full right-0 mb-2 w-72 rounded-2xl border border-neutral-800 bg-neutral-900 p-4 shadow-2xl shadow-black/40"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-white">Getting Started</span>
              <button onClick={handleDismiss} className="text-neutral-600 hover:text-neutral-400 p-0.5" aria-label="Dismiss">
                <XIcon className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden mb-4">
              <div
                className="h-full bg-brand-orange rounded-full transition-all duration-500 ease-apple"
                style={{ width: `${progress}%` }}
              />
            </div>

            <div className="space-y-2.5">
              {items.map((item) => {
                const done = item.check()
                const inner = (
                  <div className={`flex items-center gap-2 text-sm py-1 ${done ? 'text-neutral-500' : 'text-neutral-300 hover:text-white'}`}>
                    {done ? (
                      <CheckCircleIcon className="h-4 w-4 text-emerald-400 shrink-0" />
                    ) : (
                      <CircleIcon className="h-4 w-4 text-neutral-600 shrink-0" />
                    )}
                    <span className={done ? 'line-through' : ''}>{item.label}</span>
                  </div>
                )

                if (item.href && !done) {
                  return <Link key={item.key} href={item.href} onClick={() => setExpanded(false)}>{inner}</Link>
                }
                return <div key={item.key}>{inner}</div>
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating pill */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2.5 pl-3 pr-4 py-2.5 rounded-full border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 shadow-xl shadow-black/30 transition-all ease-apple group"
      >
        <div className="relative">
          <Rocket className="w-5 h-5 text-brand-orange" weight="fill" />
          <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-brand-orange rounded-full animate-pulse" />
        </div>
        <div className="flex flex-col items-start">
          <span className="text-xs font-medium text-white leading-tight">
            {nextItem ? nextItem.label : 'Setup'}
          </span>
          <span className="text-[10px] text-neutral-500 leading-tight">{completedCount}/{items.length} complete</span>
        </div>
      </button>
    </div>
  )
}
