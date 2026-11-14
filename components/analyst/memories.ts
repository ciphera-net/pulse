import type { AnalystMemories } from '@/lib/api/analyst'

/**
 * Analyst's memories, shared by the chat (./AnswerMemory) and Site Settings, Analyst: one cache key, so a yes in a chat
 * and a switch in Settings are seen by both at once, and the list's address. No React, so Settings pulls in nothing of
 * the chat.
 */

/** The SWR key of a site's memories and switch. */
export const memoriesKey = (siteId: string) => ['analyst-memories', siteId] as const

/** Where a site's memories are listed and switched. */
export const memoriesHref = (siteId: string) => `/settings/site/analyst?siteId=${encodeURIComponent(siteId)}`

/** Whether the site's memories are still undecided and no Not now holds the ask back at `now`; false until known. */
export function memoryAskOpen(m: Pick<AnalystMemories, 'enabled' | 'offer_snoozed_until'> | undefined, now: number): boolean {
  if (!m || m.enabled !== null) return false
  if (!m.offer_snoozed_until) return true
  const until = Date.parse(m.offer_snoozed_until)
  return Number.isNaN(until) || until <= now
}
