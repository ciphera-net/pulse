import apiRequest from '@/lib/api/client'

/**
 * The Pulse Analytics MCP consent API and Settings → Connected apps
 * (PULSE-41). pulse-backend is the OAuth authorization server for its own MCP
 * resource: an assistant sends the browser to `/connect?request=<id>`, and
 * this page approves or denies that request for ONE workspace and some of its
 * sites. Design: Pulse/docs/plans/24-09-2026-pulse-mcp-design.md §3.
 *
 * Every call here is Bearer-only on the server (threat model D-TM10): the
 * in-memory access token apiRequest attaches is what authorises it, so a
 * cross-site form cannot ride the session cookie into an approval.
 */

/**
 * A verified app's brand. pulse-backend names it ONLY from an identity it
 * checked (the CIMD host it fetched from, or a client registered in code) —
 * never from what an app says about itself, and never from the redirect host.
 */
export type ClientBrand = 'claude' | 'chatgpt' | 'cursor'

/** What the consent screen may show about a pending request, and nothing about who started it. */
export interface ConnectRequest {
  client_name: string
  /**
   * true only for an app Pulse checked: a CIMD document fetched from its own
   * domain (claude.ai, chatgpt.com) or a client registered in code (Cursor).
   * false = it named itself when it registered (DCR).
   */
  client_verified: boolean
  /** The verified app's mark, derived server-side from its verified identity; null = draw a monogram. */
  client_brand: ClientBrand | null
  client_kind: 'cimd' | 'dcr' | 'preregistered'
  /** Where the approval is sent. Always shown: it is the one fact an app cannot fake. */
  redirect_host: string
  /** Every redirect is on this computer (127.0.0.1 / localhost): show the local-program warning. */
  loopback_only: boolean
  scope: string[]
  expires_at: string
}

export interface ConnectDecision {
  /** The assistant's redirect, built server-side with code (or error), state and iss. */
  redirect: string
}

/** The site scope a connection is approved for; mirrors api_keys' CHECK. */
export type ConnectScope =
  | { scope_all_sites: true; site_ids: [] }
  | { scope_all_sites: false; site_ids: string[] }

export const getConnectRequest = (requestId: string) =>
  apiRequest<ConnectRequest>(`/connect/requests/${encodeURIComponent(requestId)}`)

export const approveConnectRequest = (requestId: string, scope: ConnectScope) =>
  apiRequest<ConnectDecision>(`/connect/requests/${encodeURIComponent(requestId)}/approve`, {
    method: 'POST',
    body: JSON.stringify(scope),
  })

export const denyConnectRequest = (requestId: string) =>
  apiRequest<ConnectDecision>(`/connect/requests/${encodeURIComponent(requestId)}/deny`, {
    method: 'POST',
    body: '{}',
  })

export type ConnectionStatus = 'connected' | 'disconnected' | 'lapsed'

/** One connection, as Settings → Connected apps lists it. */
export interface Connection {
  id: string
  client_name: string
  client_verified: boolean
  client_brand: ClientBrand | null
  redirect_host: string
  /** Who connected it. Names come from the members list: pulse-backend holds ids only. */
  user_id: string
  scope_all_sites: boolean
  site_ids: string[]
  created_at: string
  /** null means never used — set only by an /mcp call, never by a token refresh. */
  last_used_at: string | null
  expires_at: string
  revoked_at: string | null
  revoked_reason: string | null
  status: ConnectionStatus
}

export const listConnectedApps = () =>
  apiRequest<{ connections: Connection[] }>('/connected-apps')

export const disconnectApp = (connectionId: string) =>
  apiRequest<unknown>(`/connected-apps/${encodeURIComponent(connectionId)}`, { method: 'DELETE' })

/**
 * The server's refusal codes on approve, so the page can say what went wrong
 * in words rather than echo a status. `request_expired` is also what an
 * already-used or unknown request answers (T2: one answer for all three).
 */
export type ApproveError =
  | 'request_expired'
  | 'no_workspace'
  | 'no_sites'
  | 'invalid_scope'
  | 'invalid_site'
  | 'not_a_member'
  | 'site_scoped_role'
  | 'credential_limit_reached'
  | 'unavailable'
  | 'server_error'
