import { describe, it, expect } from 'vitest'
import { renderNotification } from '../index'
import type { Receipt } from '@/lib/notifications/types'

function makeReceipt<T>(type: string, payload: T): Receipt {
  return {
    user_id: 'u', event_id: 'e', delivered_at: null, read_at: null,
    event: {
      id: 'e', organization_id: 'o', type: type as any, payload: payload as any,
      link_url: null, link_label_key: null,
      created_at: '2026-04-15T12:00:00Z', expires_at: '2026-07-14T12:00:00Z',
    },
  }
}

describe('uptime renderers', () => {
  it('uptime_monitor_down — title contains site id and body contains status code', () => {
    const r = makeReceipt('uptime_monitor_down', { monitor_id: 'm1', site_id: 's-1', status_code: 500 })
    const { title, body } = renderNotification(r)
    expect(title).toContain('Monitor down')
    expect(body).toContain('500')
  })

  it('uptime_monitor_recovered — title contains site id and body contains downtime', () => {
    const r = makeReceipt('uptime_monitor_recovered', { monitor_id: 'm1', site_id: 's-1', downtime_seconds: 90 })
    const { title, body } = renderNotification(r)
    expect(title).toContain('Monitor recovered')
    expect(body).toContain('2m')
  })

  it('uptime_ssl_expiring — title contains days count', () => {
    // Use a far-future date so the days count is always > 0
    const expires_at = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString()
    const r = makeReceipt('uptime_ssl_expiring', { monitor_id: 'm1', site_id: 's-1', expires_at })
    const { title, body } = renderNotification(r)
    expect(title).toMatch(/SSL expiring in \d+ days/)
    expect(body).toContain('s-1')
  })
})
