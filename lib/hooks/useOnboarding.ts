'use client'

import { useCallback } from 'react'
import useSWR from 'swr'
import { useAuth } from '@/lib/auth/context'
import { useSites } from '@/lib/swr/sites'
import { useMembers } from '@/lib/swr/members'
import { listGoals, type Goal } from '@/lib/api/goals'

const DISMISSED_PREFIX = 'pulse_checklist_dismissed_'

export interface OnboardingItem {
  key: string
  label: string
  href?: string
  completed: boolean
  /**
   * False for steps that are worth offering but must not gate completion.
   * A one-person workspace cannot invite a teammate, so counting that step
   * left every solo org stuck at 4/5 forever — a checklist whose only exit
   * was the dismiss X. Offered, not required.
   */
  countsTowardCompletion?: boolean
  /** Why this step cannot be taken yet. Set only while it is unreachable. */
  lockedReason?: string
}

/**
 * Single source of truth for the Getting Started checklist. The chip renders
 * TWICE (desktop GlassTopBar is hidden below md, mobile ContentHeader is
 * md:hidden), so all state — including dismissal — must live in a store both
 * mounts share. SWR is that store; localStorage is only the persistence layer
 * behind the dismissed key.
 */
export function useOnboarding() {
  const { user } = useAuth()
  const orgId = user?.org_id
  const { sites, isLoading: sitesLoading } = useSites()
  const { members } = useMembers()
  const firstSiteId = sites[0]?.id ?? ''

  // Same SWR key as the dashboard's useGoals so the cache is shared, but with
  // refreshInterval: 0 — onboarding completion changes on user action, never
  // in the background, and this hook mounts in the shell on every page. The
  // dashboard's 60s poll must not ride along app-wide.
  const { data: goals } = useSWR<Goal[]>(
    firstSiteId ? ['goals', firstSiteId] : null,
    () => listGoals(firstSiteId),
    { refreshInterval: 0, revalidateOnFocus: false, dedupingInterval: 30_000 }
  )

  // Dismissal in SWR keyed by org: dismiss() in one mount mutates the shared
  // cache, so the other mount hides in the same render pass. `undefined` means
  // "not read yet" and keeps the chip hidden — no flash before hydration.
  const { data: dismissed, mutate: mutateDismissed } = useSWR(
    orgId ? ['onboarding-dismissed', orgId] : null,
    ([, id]: [string, string]) => localStorage.getItem(`${DISMISSED_PREFIX}${id}`) === 'true',
    { revalidateOnFocus: false }
  )

  const dismiss = useCallback(() => {
    if (!orgId) return
    localStorage.setItem(`${DISMISSED_PREFIX}${orgId}`, 'true')
    mutateDismissed(true, false)
  }, [orgId, mutateDismissed])

  // Before a site exists these steps have nowhere to go. They used to render
  // identically to the live one, so a new customer clicked them and nothing
  // happened; now they say what unlocks them.
  const needsSite = firstSiteId ? undefined : 'add a site first'

  const items: OnboardingItem[] = [
    { key: 'site', label: 'Add your first site', href: '/sites/new', completed: sites.length > 0 },
    // Point directly at the settings tabs. The old `/sites/{id}/settings` /
    // `/sites/{id}/goals` targets were a deprecated redirect shim and a dead
    // 404 respectively. The site-settings page resolves the active site from
    // sessionStorage, falling back to the first site (firstSiteId here).
    // `is_verified` is only ever flipped by someone pressing a button, so a
    // correctly installed site read as incomplete forever (FleetCard calls it
    // "the known false green"). The server's derived install status is what
    // actually knows whether events arrived.
    { key: 'script', label: 'Install tracking script', href: firstSiteId ? '/settings/site/general' : undefined, completed: sites.some(s => s.install_status && s.install_status !== 'never_installed'), lockedReason: needsSite },
    { key: 'teammate', label: 'Invite a teammate', href: '/settings/organization/members', completed: members.length > 1, countsTowardCompletion: false },
    { key: 'goal', label: 'Set up a goal', href: firstSiteId ? '/settings/site/goals' : undefined, completed: (goals?.length ?? 0) > 0, lockedReason: needsSite },
  ]

  // Completion counts only the steps that gate it — see countsTowardCompletion.
  const counted = items.filter(i => i.countsTowardCompletion !== false)
  const completedCount = counted.filter(i => i.completed).length
  const total = counted.length
  const allDone = completedCount === total
  const nextItem = counted.find(i => !i.completed) ?? items.find(i => !i.completed)

  // Gate visibility on the data actually being there. The chip is top-bar
  // chrome: appearing with a provisional 0/5 and then settling (or vanishing
  // at allDone) would visibly shift the bell/avatar cluster on every load.
  const dataReady =
    !sitesLoading &&
    (firstSiteId === '' || goals !== undefined)
  const visible = Boolean(orgId) && dismissed === false && dataReady && !allDone

  return { items, completedCount, total, allDone, nextItem, visible, dismiss }
}
