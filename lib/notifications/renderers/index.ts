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
}

type Renderer = (r: Receipt) => Rendered

const registry: Partial<Record<NotificationType, Renderer>> = {
  ...billingRenderers,
  ...uptimeRenderers,
  ...securityRenderers,
  ...siteRenderers,
  ...teamRenderers,
  ...systemRenderers,
}

export function renderNotification(r: Receipt): Rendered {
  const renderer = registry[r.event.type]
  if (!renderer) {
    return { title: r.event.type, body: '', linkLabel: null }
  }
  return renderer(r)
}
