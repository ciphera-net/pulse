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
