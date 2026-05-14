'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import { useAuth } from '@/lib/auth/context'
import { useSites } from '@/lib/swr/sites'
import { useMembers } from '@/lib/swr/members'
import { useGoals, useReportSchedules } from '@/lib/swr/dashboard'
import { XIcon } from '@ciphera-net/ui'

const DISMISSED_PREFIX = 'pulse_onboarding_checklist_dismissed_'

export default function OnboardingChecklist() {
  const { user } = useAuth()
  const orgId = user?.org_id
  const [dismissed, setDismissed] = useState(true)

  useEffect(() => {
    if (!orgId) return
    if (localStorage.getItem(`${DISMISSED_PREFIX}${orgId}`) !== 'true') {
      setDismissed(false)
    }
  }, [orgId])
  const { sites } = useSites()
  const { members } = useMembers()
  const firstSiteId = sites[0]?.id ?? ''
  const { data: goals } = useGoals(firstSiteId || '')
  const { data: schedules } = useReportSchedules(firstSiteId || '')

  const steps = [
    {
      key: 'site',
      label: 'Add your first site',
      description: 'Start tracking visitors on your website.',
      cta: 'Add a site',
      href: '/sites/new',
      completed: sites.length > 0,
    },
    {
      key: 'script',
      label: 'Install tracking script',
      description: 'Verify your site is receiving visitor data.',
      cta: 'View installation',
      href: firstSiteId ? `/sites/${firstSiteId}/settings` : undefined,
      completed: sites.some(s => s.is_verified),
    },
    {
      key: 'teammate',
      label: 'Invite a teammate',
      description: 'Collaborate with your team on dashboards and insights.',
      cta: 'Invite teammates',
      href: '/settings/organization/members',
      completed: members.length > 1,
    },
    {
      key: 'goal',
      label: 'Set up a goal',
      description: 'Track conversions and measure what matters.',
      cta: 'Create a goal',
      href: firstSiteId ? `/sites/${firstSiteId}/goals` : undefined,
      completed: (goals?.length ?? 0) > 0,
    },
    {
      key: 'reports',
      label: 'Enable email reports',
      description: 'Get weekly performance summaries delivered to your inbox.',
      cta: 'Set up reports',
      href: firstSiteId ? `/sites/${firstSiteId}/settings` : undefined,
      completed: schedules?.some(s => s.channel === 'email' && s.enabled) ?? false,
    },
  ]

  const completedCount = steps.filter(s => s.completed).length
  const allComplete = completedCount === steps.length
  const activeIndex = steps.findIndex(s => !s.completed)
  const progressPct = (completedCount / steps.length) * 100

  if (dismissed || !user?.org_id || allComplete) return null

  function dismiss() {
    localStorage.setItem(`${DISMISSED_PREFIX}${user!.org_id}`, 'true')
    setDismissed(true)
  }

  return (
    <AnimatePresence>
      <motion.div
        key="onboarding-checklist"
        initial={{ opacity: 1, height: 'auto' }}
        exit={{ opacity: 0, height: 0, marginBottom: 0 }}
        transition={{ duration: 0.3 }}
        className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 mb-6 overflow-hidden"
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-neutral-100 text-base font-semibold">Get Started</p>
            <p className="text-neutral-500 text-sm mt-0.5">Complete these steps to get the most out of Pulse</p>
          </div>
          <div className="flex items-center gap-3 shrink-0 ml-4">
            <span className="text-neutral-500 text-sm">{completedCount} of 5</span>
            <button onClick={dismiss} className="text-neutral-600 hover:text-neutral-400 p-1">
              <XIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="h-[3px] bg-neutral-800 rounded-full mt-4 mb-5 overflow-hidden">
          <div
            className="bg-orange-500 h-full rounded-full transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        <div>
          {steps.map((step, index) => {
            const isCompleted = step.completed
            const isActive = index === activeIndex

            if (isCompleted) {
              return (
                <div key={step.key} className={`flex items-center gap-3 py-2.5 ${index < steps.length - 1 ? 'border-b border-neutral-800/50' : ''}`}>
                  <div className="w-5 h-5 rounded-full bg-emerald-600 flex items-center justify-center shrink-0">
                    <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                      <path d="M2.5 6L5 8.5L9.5 4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <span className="text-neutral-600 text-sm line-through">{step.label}</span>
                </div>
              )
            }

            if (isActive) {
              return (
                <div key={step.key} className={`bg-neutral-800/50 rounded-lg p-3 -mx-1 my-1 ${index < steps.length - 1 ? '' : ''}`}>
                  <div className="flex items-center gap-3">
                    <div className="w-5 h-5 rounded-full border-2 border-neutral-700 shrink-0" />
                    <span className="text-neutral-100 text-sm font-medium">{step.label}</span>
                  </div>
                  <div className="ml-8">
                    <p className="text-neutral-500 text-xs mt-1">{step.description}</p>
                    {step.href && (
                      <Link href={step.href}>
                        <button className="bg-orange-500 hover:bg-orange-600 text-white text-xs font-medium px-3.5 py-1.5 rounded-lg mt-2 transition-colors">
                          {step.cta}
                        </button>
                      </Link>
                    )}
                  </div>
                </div>
              )
            }

            return (
              <div key={step.key} className={`flex items-center gap-3 py-2.5 ${index < steps.length - 1 ? 'border-b border-neutral-800/50' : ''}`}>
                <div className="w-5 h-5 rounded-full border-2 border-neutral-700 shrink-0" />
                <span className="text-neutral-400 text-sm">{step.label}</span>
              </div>
            )
          })}
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
