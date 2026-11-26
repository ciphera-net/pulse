import apiRequest from './client'

// ============================================================================
// Types
// ============================================================================

export interface QuarantineStats {
  total_quarantined: number
  by_reason: Record<string, number>
  by_method: Record<string, number>
  last_24h: number
  last_7d: number
  last_30d: number
}

export async function getQuarantineStats(siteId: string): Promise<QuarantineStats> {
  return apiRequest(`/sites/${siteId}/quarantine/stats`)
}

/**
 * One row of what the bot filter kept out: one of its rules (its own name, a published contract),
 * `manual` (visits Ciphera held by hand), or `earlier`, the filter Pulse used before. A count is
 * `null` when the row never counts at that moment: the user-agent rules cannot judge a stored visit,
 * and the end-of-visit rules never see a page view arrive.
 */
export interface BotFilterRuleCount {
  rule: string
  page_views: number | null
  visits: number | null
}

/**
 * One window, [from, to) in UTC, ending at the end of the current hour. Page views turned away as
 * they arrived and visits filtered once they were over are two units: never add them together.
 */
export interface BotFilterWindow {
  window: '24h' | '7d' | '90d'
  from: string
  to: string
  page_views: number
  visits: number
  /** `null` while the team does not have the beta (the server decides, per team). */
  rules: BotFilterRuleCount[] | null
}

export interface BotFilterSummary {
  filter_bots: boolean
  windows: BotFilterWindow[]
}

export async function getBotFilterSummary(siteId: string): Promise<BotFilterSummary> {
  return apiRequest(`/sites/${siteId}/bot-filter`)
}
