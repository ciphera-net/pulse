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

describe('system renderers', () => {
  it('system_announcement — title is correct and body contains announcement id', () => {
    const r = makeReceipt('system_announcement', { announcement_id: 'ann-10' })
    const { title, body } = renderNotification(r)
    expect(title).toBe('Announcement')
    expect(body).toContain('ann-10')
  })

  it('system_maintenance — title contains start date and body contains time range', () => {
    const r = makeReceipt('system_maintenance', {
      starts_at: '2026-04-20T02:00:00Z',
      ends_at: '2026-04-20T04:00:00Z',
    })
    const { title, body } = renderNotification(r)
    expect(title).toContain('Scheduled maintenance')
    expect(body).toContain('–')
  })
})
