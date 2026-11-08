import apiRequest from './client'

/**
 * What's new (the whats-new beta): the changelog's latest Pulse posts as pulse-backend serves them, each marked unread
 * for the signed-in person. pulse-backend reads docs.ciphera.net's JSON feed and decides "unread" by post slug
 * (internal/whatsnew); the dashboard only draws the answer.
 */

/** A change's kind, as the docs changelog names it; "" when it has none (a hand-written post's lead). */
export type WhatsNewKind =
  | 'new'
  | 'beta'
  | 'everyone'
  | 'improved'
  | 'changed'
  | 'fixed'
  | 'removed'
  | 'deprecated'
  | 'security'
  | ''

export interface WhatsNewEntry {
  type: WhatsNewKind
  /** The note's first sentence. */
  text: string
  /** The rest of the note. */
  more?: string
  /** A docs screenshot's absolute URL, on a post's lead only. */
  image?: string
}

export interface WhatsNewPost {
  slug: string
  url: string
  title: string
  /** YYYY-MM-DD: a weekly post's date is the Monday its week starts. */
  date: string
  lead: WhatsNewEntry | null
  changes: WhatsNewEntry[]
  unread: boolean
}

export interface WhatsNewResponse {
  /** Newest first. */
  posts: WhatsNewPost[]
  unread_count: number
  changelog_url: string
}

/** GET /api/v1/whats-new. A 502 means the changelog could not be read: never "nothing new". */
export function getWhatsNew(): Promise<WhatsNewResponse> {
  return apiRequest<WhatsNewResponse>('/whats-new')
}

/** POST /api/v1/whats-new/seen: the posts in the feed now are the ones this person has seen. Answers the stored truth. */
export function markWhatsNewSeen(): Promise<WhatsNewResponse> {
  return apiRequest<WhatsNewResponse>('/whats-new/seen', { method: 'POST' })
}
