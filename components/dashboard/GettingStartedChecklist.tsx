'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth/context'
import { useSites } from '@/lib/swr/sites'
import { XIcon, CheckCircleIcon } from '@ciphera-net/ui'
import { Circle as CircleIcon } from '@phosphor-icons/react'

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

  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY, 'true')
    setDismissed(true)
  }

  return (
    <div className="mb-6 rounded-2xl border border-brand-orange/20 bg-brand-orange/5 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-white">Getting Started</h3>
          <span className="text-xs text-neutral-500">{completedCount}/{items.length}</span>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          className="text-neutral-500 hover:text-neutral-400 p-1 rounded"
          aria-label="Dismiss"
        >
          <XIcon className="h-4 w-4" />
        </button>
      </div>
      <div className="space-y-2">
        {items.map((item) => {
          const done = item.check()
          const inner = (
            <>
              {done ? (
                <CheckCircleIcon className="h-4 w-4 text-emerald-400 shrink-0" />
              ) : (
                <CircleIcon className="h-4 w-4 text-neutral-600 shrink-0" />
              )}
              <span className={done ? 'line-through' : ''}>{item.label}</span>
            </>
          )
          const className = `flex items-center gap-2.5 text-sm ${done ? 'text-neutral-500' : 'text-neutral-300 hover:text-white cursor-pointer'}`

          if (item.href && !done) {
            return (
              <Link key={item.key} href={item.href} className={className}>
                {inner}
              </Link>
            )
          }
          return (
            <div key={item.key} className={className}>
              {inner}
            </div>
          )
        })}
      </div>
    </div>
  )
}
