import type { NotificationType, Receipt } from '@/lib/notifications/types'
import { billingRenderers } from './billing'

export interface Rendered {
  title: string
  body: string
  linkLabel: string | null
}

type Renderer = (r: Receipt) => Rendered

const registry: Partial<Record<NotificationType, Renderer>> = {
  ...billingRenderers,
  // uptime, security, site, team, system renderers wired in Task 3.3
}

export function renderNotification(r: Receipt): Rendered {
  const renderer = registry[r.event.type]
  if (!renderer) {
    return { title: r.event.type, body: '', linkLabel: null }
  }
  return renderer(r)
}
