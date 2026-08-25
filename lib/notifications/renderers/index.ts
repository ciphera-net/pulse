import type { ReactNode } from 'react'
import type { NotificationType, Receipt } from '@/lib/notifications/types'
import { billingRenderers } from './billing'
import { uptimeRenderers } from './uptime'
import { securityRenderers } from './security'
import { siteRenderers } from './site'
import { teamRenderers } from './team'
import { systemRenderers } from './system'

export interface Rendered {
  title: string
  body: string
  linkLabel: string | null
  icon?: ReactNode
}

/**
 * Resolver functions supplied by the React component layer.
 * When present, renderers replace bare UUIDs with human-readable names.
 * When absent (e.g. server-side digest, tests) renderers fall back to
 * `'site <id>'` / `'user <id>'` strings.
 */
export interface Resolvers {
  resolveSiteName: (id: string) => string
  resolveUserName: (id: string) => string
}

type Renderer = (r: Receipt, resolvers?: Resolvers) => Rendered

const registry = {
  ...billingRenderers,
  ...uptimeRenderers,
  ...securityRenderers,
  ...siteRenderers,
  ...teamRenderers,
  ...systemRenderers,
} satisfies Record<NotificationType, Renderer>

export function renderNotification(r: Receipt, resolvers?: Resolvers): Rendered {
  const renderer = registry[r.event.type as NotificationType]
  if (!renderer) {
    return { title: r.event.type, body: '', linkLabel: null }
  }
  try {
    return renderer(r, resolvers)
  } catch {
    // A renderer throwing on one malformed payload (a backend has shipped
    // billing_payment_failed without a currency) must degrade to ONE plain
    // row — not blank the entire notification center, which is what an
    // uncaught throw inside the list map did.
    return { title: r.event.type, body: '', linkLabel: null }
  }
}
