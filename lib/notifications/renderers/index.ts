import type { ReactNode } from 'react'
import type { NotificationType, Receipt } from '@/lib/notifications/types'
import { billingRenderers } from './billing'
import { uptimeRenderers } from './uptime'
import { securityRenderers } from './security'
import { siteRenderers } from './site'
import { teamRenderers } from './team'
import { systemRenderers } from './system'
import { lifecycleRenderers } from './lifecycle'

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

// `timeZone` is the viewer's display-timezone preference (18-09-2026 design
// §4.3), optional and additive — only security.tsx and system.tsx render an
// instant today and read it; every other renderer ignores the extra arg.
type Renderer = (r: Receipt, resolvers?: Resolvers, timeZone?: string) => Rendered

const registry = {
  ...billingRenderers,
  ...uptimeRenderers,
  ...securityRenderers,
  ...siteRenderers,
  ...teamRenderers,
  ...systemRenderers,
  ...lifecycleRenderers,
} satisfies Record<NotificationType, Renderer>

export function renderNotification(r: Receipt, resolvers?: Resolvers, timeZone?: string): Rendered {
  const renderer = registry[r.event.type as NotificationType]
  if (!renderer) return fallback(r)
  try {
    return renderer(r, resolvers, timeZone)
  } catch {
    // A renderer throwing on one malformed payload (a backend has shipped
    // billing_payment_failed without a currency) must degrade to ONE plain
    // row — not blank the entire notification center, which is what an
    // uncaught throw inside the list map did.
    return fallback(r)
  }
}

/**
 * The one plain row for a type with no renderer, or one whose renderer threw.
 *
 * 🔴 NEVER THE TYPE KEY (PULSE-67). The title is the registry's label for the
 * type, which Iris reads from notification_types at list time: the email's
 * generic arm titles itself "Pulse — <display name>" for the same reason, and
 * a type_key string is never shown, split or title-cased. The body is the
 * email's generic line (Iris render.go, PULSE-59): it names Pulse, never a
 * workspace, because the card cannot tell a reader who works alone from one
 * in a team. From a backend that predates the label, that line is the title
 * and there is no body.
 */
const GENERIC_LINE = 'A new notification in Pulse.'

function fallback(r: Receipt): Rendered {
  const label = r.type_display_name?.trim()
  if (label) return { title: label, body: GENERIC_LINE, linkLabel: null }
  return { title: GENERIC_LINE, body: '', linkLabel: null }
}
