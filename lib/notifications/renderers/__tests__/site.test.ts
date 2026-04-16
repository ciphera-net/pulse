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

describe('site renderers', () => {
  it('site_added — title contains site id', () => {
    const r = makeReceipt('site_added', { site_id: 'site-42' })
    const { title } = renderNotification(r)
    expect(title).toContain('site-42')
  })

  it('site_tracking_issue — title contains site id and body contains issue code', () => {
    const r = makeReceipt('site_tracking_issue', { site_id: 'site-42', issue_code: 'SCRIPT_MISSING' })
    const { title, body } = renderNotification(r)
    expect(title).toContain('site-42')
    expect(body).toContain('SCRIPT_MISSING')
  })

  it('site_export_ready — title is correct and body contains site id', () => {
    const r = makeReceipt('site_export_ready', { export_id: 'exp-1', site_id: 'site-42' })
    const { title, body } = renderNotification(r)
    expect(title).toBe('Export ready')
    expect(body).toContain('site-42')
  })
})
