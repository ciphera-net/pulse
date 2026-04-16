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

describe('security renderers', () => {
  it('security_new_device_login — title contains device hint', () => {
    const r = makeReceipt('security_new_device_login', {
      device_hint: 'MacBook Pro',
      country_code: 'DE',
      at: '2026-04-15T10:00:00Z',
    })
    const { title, body } = renderNotification(r)
    expect(title).toContain('MacBook Pro')
    expect(body).toContain('Germany')
  })

  it('security_password_changed — title is correct', () => {
    const r = makeReceipt('security_password_changed', { at: '2026-04-15T09:00:00Z' })
    const { title } = renderNotification(r)
    expect(title).toBe('Password changed')
  })

  it('security_2fa_enabled — title is correct', () => {
    const r = makeReceipt('security_2fa_enabled', { at: '2026-04-15T08:00:00Z' })
    const { title } = renderNotification(r)
    expect(title).toBe('Two-factor authentication enabled')
  })

  it('security_api_key_created — title is correct', () => {
    const r = makeReceipt('security_api_key_created', { key_id: 'k1', name_hash: 'abc' })
    const { title } = renderNotification(r)
    expect(title).toBe('API key created')
  })
})
