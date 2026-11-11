import type { ThreadMessageLike } from '@assistant-ui/react'
import type { AnalystConversation } from '@/lib/api/analyst'
import { formatSiteTime, shiftDayKey, zoneDayKey, zoneParts } from '@/lib/utils/siteTime'
import { turnMetadata, turnParts } from './turn'

/**
 * Past chats (round 6, pick 3: the newest under the suggestions, ruled 10-11-2026). What the page makes of
 * GET /sites/:id/barry/conversations, which lists a person's own chats about the site, the most recently active first,
 * each with its turns oldest first. Pure, so the tests can feed it the shapes pulse-backend sends.
 */

/** How many past chats the welcome lists before "Show all". */
export const RECENT_SHOWN = 3

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** A past chat as one row: its first question, and when it was last added to (the list's own order). */
export interface RecentChat {
  chat: AnalystConversation
  title: string
  lastAt: string
}

export function recentChats(conversations: readonly AnalystConversation[]): RecentChat[] {
  return conversations.flatMap((chat) => {
    const first = chat.turns[0]
    const last = chat.turns[chat.turns.length - 1]
    if (!first || !last) return []
    return [{ chat, title: first.question, lastAt: last.created_at }]
  })
}

/**
 * "14:30" for today, "Yesterday", "3 Nov", or "3 Nov 2025" outside the current year: calendar days in the zone the
 * person reads times in (Account › Profile › Show times in), so a DST day keeps its label.
 */
export function chatWhenLabel(iso: string, zone: string, now: Date = new Date()): string {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return ''
  const day = zoneDayKey(at, zone)
  const today = zoneDayKey(now, zone)
  if (day === today) return formatSiteTime(at, zone)
  if (day === shiftDayKey(today, -1)) return 'Yesterday'
  const p = zoneParts(at, zone)
  const label = `${p.day} ${MONTHS[p.month - 1]}`
  return p.year !== zoneParts(now, zone).year ? `${label} ${p.year}` : label
}

/**
 * A past chat as the thread's starting messages: each turn's question, then its answer with the figures behind it
 * and the questions offered after it, drawn exactly as when it was first answered.
 */
export function chatMessages(conversation: AnalystConversation): ThreadMessageLike[] {
  return conversation.turns.flatMap((turn): ThreadMessageLike[] => {
    const createdAt = new Date(turn.created_at)
    return [
      { id: `${turn.id}-question`, role: 'user', content: [{ type: 'text', text: turn.question }], createdAt },
      { id: `${turn.id}-answer`, role: 'assistant', content: turnParts(turn), createdAt, metadata: turnMetadata(turn) },
    ]
  })
}
