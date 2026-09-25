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

// The words are the email's (Iris render.go), ruled by the owner 25-09-2026
// (PULSE-59, variant E1-a and E2): no container word, because a card cannot
// tell a reader who works alone from one in a team, and the same guards the
// email copy follows.
const CONTAINER_WORD = /workspace|organi[sz]ation|\bteam\b/i
const VOICE = { dash: /[\u2014\u2013]/, contraction: /\b\w+'(t|s|re|ve|ll|d|m)\b/i, bang: /!/ }

function expectHouseVoice(text: string) {
  expect(text).not.toMatch(CONTAINER_WORD)
  expect(text).not.toMatch(VOICE.dash)
  expect(text).not.toMatch(VOICE.contraction)
  expect(text).not.toMatch(VOICE.bang)
}

describe('lifecycle renderers', () => {
  it('lifecycle_no_site, step 1: the fact and its consequence, with no container word', () => {
    const r = makeReceipt('lifecycle_no_site', { days_since_created: 3, step: 1 })
    const { title, body, linkLabel } = renderNotification(r)
    expect(title).toBe('You have not added a site yet')
    expect(body).toBe('There is no site in Pulse yet, so it is collecting nothing.')
    expect(linkLabel).toBe('Add your first site')
    expectHouseVoice(`${title} ${body} ${linkLabel}`)
  })

  it('lifecycle_no_site, step 2 and later: the same fact with "still"', () => {
    for (const step of [2, 3]) {
      const r = makeReceipt('lifecycle_no_site', { days_since_created: 10, step })
      const { title, body } = renderNotification(r)
      expect(title).toBe('You still have not added a site')
      expect(body).toBe('There is still no site in Pulse, so it is collecting nothing.')
      expectHouseVoice(`${title} ${body}`)
    }
  })

  // The "You created it N days ago" line went with PULSE-59: it anchored on
  // when the person got the workspace, which has no wording true for both a
  // person alone and one who started a second team. No age, whatever the count.
  it('states no age and no creation, whatever the day count', () => {
    for (const days of [0, 1, 3, 10, 400]) {
      const { title, body } = renderNotification(makeReceipt('lifecycle_no_site', { days_since_created: days, step: 1 }))
      expect(`${title} ${body}`).not.toMatch(/\bday|ago|created/i)
    }
  })

  it('reads a missing step as the first message, never a later one', () => {
    const { title, body } = renderNotification(makeReceipt('lifecycle_no_site', { days_since_created: 3 }))
    expect(title).toBe('You have not added a site yet')
    expect(body).toBe('There is no site in Pulse yet, so it is collecting nothing.')
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

  // MyPreferencesTab renders the wire's categories in this list's order, so a
  // category missing from it is invisible in settings and cannot be switched
  // there, however correctly the wire reports it.
  it('the lifecycle category is in the settings list, and is not critical', () => {
    const cat = NOTIFICATION_CATEGORIES.find((c) => c.id === 'lifecycle')
    expect(cat).toBeDefined()
    expect(cat!.critical).toBe(false)
  })

})

describe('the generic fallback', () => {
  // The email's generic line (PULSE-59, E4): Pulse, never a workspace.
  it('gives a type with no renderer one plain row that names Pulse, not a workspace', () => {
    const { body, linkLabel } = renderNotification(makeReceipt('a_type_that_does_not_exist', {}))
    expect(body).toBe('A new notification in Pulse.')
    expect(linkLabel).toBeNull()
  })

  it('gives a renderer that throws on a malformed payload the same plain row', () => {
    // A payload whose field cannot be read stands in for any malformed one.
    const malformed = { get user_id(): string { throw new Error('malformed payload') } }
    const { body } = renderNotification(makeReceipt('team_member_joined', malformed))
    expect(body).toBe('A new notification in Pulse.')
  })
})
