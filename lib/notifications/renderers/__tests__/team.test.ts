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

describe('team renderers', () => {
  it('team_member_invited — title is correct and body contains inviter id', () => {
    const r = makeReceipt('team_member_invited', { inviter_user_id: 'user-99' })
    const { title, body } = renderNotification(r)
    expect(title).toBe('You were invited to this workspace')
    expect(body).toContain('user-99')
  })

  it('team_member_joined — title contains user id', () => {
    const r = makeReceipt('team_member_joined', { user_id: 'user-77' })
    const { title } = renderNotification(r)
    expect(title).toContain('user-77')
  })

  it('team_role_changed — title contains user id and new role', () => {
    const r = makeReceipt('team_role_changed', { user_id: 'user-55', new_role: 'admin' })
    const { title } = renderNotification(r)
    expect(title).toContain('user-55')
    expect(title).toContain('admin')
  })
})
