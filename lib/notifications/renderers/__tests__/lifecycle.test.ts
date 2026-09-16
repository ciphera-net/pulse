import { describe, it, expect } from 'vitest'
import { renderNotification } from '../index'
import { NOTIFICATION_CATEGORIES } from '@/lib/notifications/categories'
import { getTypeIcon } from '@/lib/utils/notifications'
import type { Receipt } from '@/lib/notifications/types'

function makeReceipt<T>(type: string, payload: T): Receipt {
  return {
    user_id: 'u', event_id: 'e', delivered_at: null, read_at: null,
    event: {
      id: 'e', organization_id: 'o', type: type as any, payload: payload as any,
      link_url: null, link_label_key: null,
      created_at: '2026-09-11T12:00:00Z', expires_at: '2026-11-10T12:00:00Z',
    },
  }
}

describe('lifecycle renderers', () => {
  it('lifecycle_no_site — states the fact, its consequence, and the age', () => {
    const r = makeReceipt('lifecycle_no_site', { days_since_created: 3, step: 1 })
    const { title, body, linkLabel } = renderNotification(r)
    expect(title).toBe('Your workspace has no site')
    expect(body).toBe('Pulse is collecting nothing until you add one. You created it 3 days ago.')
    expect(linkLabel).toBe('Add your first site')
  })

  it('says "1 day" rather than "1 days"', () => {
    const r = makeReceipt('lifecycle_no_site', { days_since_created: 1, step: 1 })
    expect(renderNotification(r).body).toContain('You created it 1 day ago.')
  })

  // A missing day count says LESS rather than "0 days ago". The payload schema
  // requires the field, so this only fires if a producer bypassed validation —
  // but a false sentence is worse than a shorter one, and the renderer is the
  // last place able to refuse to print it.
  it('drops the age clause rather than printing zero days', () => {
    const r = makeReceipt('lifecycle_no_site', { step: 1 })
    const { title, body } = renderNotification(r)
    expect(title).toBe('Your workspace has no site')
    expect(body).toBe('Pulse is collecting nothing until you add one.')
    expect(body).not.toContain('0 day')
  })

  // 🔴 The one promise this copy may never make: `step` exists so a second
  // message can be added later, so "the only reminder" would be a delivery
  // guarantee the schema is designed to be able to break.
  it('promises nothing about future sends', () => {
    const r = makeReceipt('lifecycle_no_site', { days_since_created: 3, step: 1 })
    const { title, body } = renderNotification(r)
    const text = `${title} ${body}`.toLowerCase()
    for (const forbidden of ['only reminder', 'only message', 'last reminder', 'will not send']) {
      expect(text).not.toContain(forbidden)
    }
  })

  // The renderer registry's `satisfies` assertion cannot see the icon map —
  // it is a bare Record<string, ReactElement> — so a new type silently falls
  // back to the lightning bolt. This is the assertion that would have caught
  // that, and the operator_* types are the standing proof it can happen.
  it('has its own icon rather than the unknown-type fallback', () => {
    expect(getTypeIcon('lifecycle_no_site')).not.toEqual(getTypeIcon('a_type_that_does_not_exist'))
  })

  // WorkspaceNotificationsTab maps over this list directly, so a category
  // missing from it is invisible in settings and cannot be toggled there,
  // however correctly the wire reports it.
  it('the lifecycle category is in the settings list, and is not critical', () => {
    const cat = NOTIFICATION_CATEGORIES.find((c) => c.id === 'lifecycle')
    expect(cat).toBeDefined()
    expect(cat!.critical).toBe(false)
  })
})
