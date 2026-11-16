import apiRequest, { ApiError } from './client'

/** The install check (pulse-backend internal/installcheck, internal/api/install_check.go): four steps, codes only. */
export type InstallCheckStepKey = 'page' | 'tag' | 'script' | 'visit'

export interface InstallCheckStep {
  key: InstallCheckStepKey
  state: 'pass' | 'fail' | 'skipped'
  cause?:
    | 'unreachable'
    | 'http_status'
    | 'missing'
    | 'wrong_domain'
    | 'blocked_csp'
    | 'blocked'
    | 'failed'
    | 'not_loaded'
    | 'not_sent'
  status?: number
  ms?: number
  found?: string
  via?: 'config' | 'other'
  reason?: string
}

export interface InstallCheckState {
  status: 'none' | 'running' | 'done' | 'error'
  started_at?: string
  finished_at?: string
  passed?: boolean
  steps?: InstallCheckStep[]
  error?: 'busy' | 'failed'
}

export async function getInstallCheck(siteId: string): Promise<InstallCheckState> {
  return apiRequest<InstallCheckState>(`/sites/${siteId}/install-check`)
}

/** Starts a check. A check already running for the site answers 409 with that check, which is returned as is. */
export async function startInstallCheck(siteId: string): Promise<InstallCheckState> {
  try {
    return await apiRequest<InstallCheckState>(`/sites/${siteId}/install-check`, { method: 'POST' })
  } catch (err) {
    if (err instanceof ApiError && err.status === 409 && err.data && typeof err.data.status === 'string') {
      return err.data as unknown as InstallCheckState
    }
    throw err
  }
}
