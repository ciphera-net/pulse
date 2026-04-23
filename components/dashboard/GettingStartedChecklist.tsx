'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import { useAuth } from '@/lib/auth/context'
import { useSites } from '@/lib/swr/sites'
import { getOrganizationMembers } from '@/lib/api/organization'
import { XIcon, CheckCircleIcon } from '@ciphera-net/ui'
import { Circle as CircleIcon } from '@phosphor-icons/react'

interface ChecklistItem {
  key: string
  label: string
  href?: string
  check: () => boolean
}

const DISMISSED_KEY = 'pulse_checklist_dismissed'

function ProgressRing({ progress, size = 32 }: { progress: number; size?: number }) {
  const strokeWidth = 3
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (progress / 100) * circumference

  return (
    <svg width={size} height={size} className="rotate-[-90deg]">
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

export default function GettingStartedChecklist() {
  const { user } = useAuth()
  const { sites } = useSites()
  const [dismissed, setDismissed] = useState(true)
  const [expanded, setExpanded] = useState(false)
  const [memberCount, setMemberCount] = useState(0)

  useEffect(() => {
    if (typeof window === 'undefined') return
    setDismissed(localStorage.getItem(DISMISSED_KEY) === 'true')
  }, [])

  useEffect(() => {
    if (!user?.org_id) return
    getOrganizationMembers(user.org_id)
      .then(members => setMemberCount(members.length))
      .catch(() => {})
  }, [user?.org_id])

  const items: ChecklistItem[] = [
    { key: 'org', label: 'Create workspace', check: () => !!user?.org_id },
    { key: 'site', label: 'Add your first site', href: '/sites/new', check: () => sites.length > 0 },
    { key: 'teammate', label: 'Invite a teammate', href: '/org-settings', check: () => memberCount > 1 },
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
    <div className="fixed bottom-5 right-5 z-[100]">
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-full right-0 mb-3 w-72 rounded-2xl border border-neutral-800 bg-neutral-900 shadow-2xl shadow-black/50"
          >
            <div className="p-4 pb-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-semibold text-white">Getting Started</span>
                <button onClick={handleDismiss} className="text-neutral-600 hover:text-neutral-400 p-0.5" aria-label="Dismiss">
                  <XIcon className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="text-xs text-neutral-500">{completedCount} of {items.length} completed</p>
            </div>

            <div className="h-1 bg-neutral-800">
              <div
                className="h-full bg-brand-orange rounded-r-full transition-all duration-500 ease-apple"
                style={{ width: `${progress}%` }}
              />
            </div>

            <div className="p-3 space-y-1">
              {items.map((item) => {
                const done = item.check()
                const inner = (
                  <div className={`flex items-center gap-2.5 px-2 py-2 rounded-lg text-sm transition-colors ${
                    done
                      ? 'text-neutral-500'
                      : 'text-neutral-300 hover:text-white hover:bg-neutral-800/50'
                  }`}>
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
      <motion.button
        type="button"
        onClick={() => setExpanded(!expanded)}
        initial={{ opacity: 0, scale: 0.8, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ delay: 0.5, type: 'spring', stiffness: 300, damping: 20 }}
        className="flex items-center gap-3 pl-3 pr-5 py-2.5 rounded-full border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 shadow-xl shadow-black/40 transition-colors ease-apple"
      >
        <div className="relative flex items-center justify-center">
          <ProgressRing progress={progress} size={36} />
          <span className="absolute text-[10px] font-bold text-brand-orange">{completedCount}/{items.length}</span>
        </div>
        <div className="flex flex-col items-start">
          <span className="text-sm font-medium text-white leading-tight">
            {nextItem?.label}
          </span>
          <span className="text-[11px] text-neutral-500 leading-tight">Next step</span>
        </div>
      </motion.button>
    </div>
  )
}
