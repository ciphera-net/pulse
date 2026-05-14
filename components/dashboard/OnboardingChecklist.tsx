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

interface Step {
  key: string
  label: string
  description: string
  cta: string
  href?: string
}

const STEPS: Step[] = [
  {
    key: 'site',
    label: 'Add your first site',
    description: 'Start tracking visitors on your website.',
    cta: 'Add a site',
    href: '/sites/new',
  },
  {
    key: 'script',
    label: 'Install tracking script',
    description: 'Verify your site is receiving visitor data.',
    cta: 'View installation',
  },
  {
    key: 'teammate',
    label: 'Invite a teammate',
    description: 'Collaborate with your team on dashboards and insights.',
    cta: 'Invite teammates',
    href: '/settings/organization/members',
  },
  {
    key: 'goal',
    label: 'Set up a goal',
    description: 'Track conversions and measure what matters.',
    cta: 'Create a goal',
  },
  {
    key: 'reports',
    label: 'Enable email reports',
    description: 'Get weekly performance summaries delivered to your inbox.',
    cta: 'Set up reports',
  },
]

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

  const completed: Record<string, boolean> = {
    site: sites.length > 0,
    script: sites.some(s => s.is_verified),
    teammate: members.length > 1,
    goal: (goals?.length ?? 0) > 0,
    reports: schedules?.some(s => s.channel === 'email' && s.enabled) ?? false,
  }

  function getHref(step: Step): string | undefined {
    if (step.href) return step.href
    if (!firstSiteId) return undefined
    if (step.key === 'script') return `/sites/${firstSiteId}/settings`
    if (step.key === 'goal') return `/sites/${firstSiteId}/goals`
    if (step.key === 'reports') return `/sites/${firstSiteId}/settings`
    return undefined
  }

  const completedCount = STEPS.filter(s => completed[s.key]).length
  const allComplete = completedCount === STEPS.length
  const activeIndex = STEPS.findIndex(s => !completed[s.key])

  if (dismissed || !orgId || allComplete) return null

  function dismiss() {
    localStorage.setItem(`${DISMISSED_PREFIX}${orgId}`, 'true')
    setDismissed(true)
  }

  return (
    <AnimatePresence>
      {!dismissed && (
        <motion.div
          key="onboarding-checklist"
          exit={{ opacity: 0, height: 0, marginBottom: 0 }}
          transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
          className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 mb-6 overflow-hidden"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <span className="text-body font-semibold text-neutral-100">Get Started</span>
              <div className="flex gap-1">
                {STEPS.map((step) => (
                  <div
                    key={step.key}
                    className={`w-4 h-[3px] rounded-full transition-colors duration-base ease-apple ${
                      completed[step.key] ? 'bg-brand-orange' : 'bg-neutral-800'
                    }`}
                  />
                ))}
              </div>
            </div>
            <button
              onClick={dismiss}
              className="text-neutral-700 hover:text-neutral-400 p-1 transition-colors duration-fast ease-apple"
            >
              <XIcon className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="relative pl-6">
            {/* Vertical timeline rail */}
            <div className="absolute left-[4.5px] top-1 bottom-1 w-px bg-neutral-800" />
            <div
              className="absolute left-[4.5px] top-1 w-px bg-emerald-600 transition-all duration-500 ease-apple"
              style={{
                height: completedCount > 0
                  ? `calc(${(completedCount / STEPS.length) * 100}% - 4px)`
                  : '0px',
              }}
            />

            {STEPS.map((step, index) => {
              const done = completed[step.key]
              const isActive = index === activeIndex
              const href = getHref(step)

              return (
                <div key={step.key} className="relative">
                  {/* Timeline dot */}
                  <div className="absolute -left-6 top-[10px] flex items-center justify-center w-[10px] h-[10px]">
                    {done ? (
                      <div className="w-[9px] h-[9px] rounded-full bg-emerald-600" />
                    ) : isActive ? (
                      <div className="w-[9px] h-[9px] rounded-full bg-brand-orange shadow-[0_0_8px_rgba(253,94,15,0.5)]" />
                    ) : (
                      <div className="w-[9px] h-[9px] rounded-full border-[1.5px] border-neutral-700" />
                    )}
                  </div>

                  {isActive ? (
                    <div className="py-1.5">
                      <div className="bg-brand-orange/[0.05] border border-brand-orange/[0.12] rounded-lg px-3.5 py-2.5 flex items-center justify-between gap-4">
                        <div>
                          <div className="text-caption font-medium text-neutral-100">{step.label}</div>
                          <div className="text-[11px] text-neutral-500 mt-0.5">{step.description}</div>
                        </div>
                        {href && (
                          <Link
                            href={href}
                            className="text-caption font-medium text-brand-orange hover:text-brand-orange-hover shrink-0 transition-colors duration-fast ease-apple"
                          >
                            {step.cta} →
                          </Link>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="py-2">
                      <span className={`text-caption ${done ? 'text-neutral-700' : 'text-neutral-500'}`}>
                        {step.label}
                      </span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
