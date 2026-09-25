import { describe, it, expect } from 'vitest'
import { renderNotification } from '../index'
import { NOTIFICATION_CATEGORIES } from '@/lib/notifications/categories'
import { getTypeIcon } from '@/lib/utils/notifications'
import type { Receipt } from '@/lib/notifications/types'

function makeReceipt<T>(type: string, payload: T, typeDisplayName?: string | null): Receipt {
  return {
    user_id: 'u', event_id: 'e', delivered_at: null, read_at: null,
    type_display_name: typeDisplayName,
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

  it('lifecycle_dormant: "your sites", and the last instant as a date, never an age', () => {
    const r = makeReceipt('lifecycle_dormant', { last_event_at: '2026-07-14T12:00:00Z', window_days: 60 })
    const { title, body, linkLabel } = renderNotification(r, undefined, 'UTC')
    expect(title).toBe('Your sites have gone quiet')
    expect(body).toBe('The last data Pulse received from your sites was on 14/07/2026.')
    expect(linkLabel).toBe('Check your sites')
    expect(body).not.toMatch(/\bdays?\b|ago/i)
    expectHouseVoice(`${title} ${body} ${linkLabel}`)
  })

  it('lifecycle_dormant: reads the date in the viewer\'s display zone', () => {
    // 23:30 UTC on the 14th is already the 15th in Brussels (CEST, +2).
    const r = makeReceipt('lifecycle_dormant', { last_event_at: '2026-07-14T23:30:00Z', window_days: 60 })
    expect(renderNotification(r, undefined, 'Europe/Brussels').body).toBe(
      'The last data Pulse received from your sites was on 15/07/2026.',
    )
  })

  it('lifecycle_dormant: says the true, smaller thing when the instant is missing or unreadable', () => {
    for (const payload of [{ window_days: 60 }, { last_event_at: 'not-a-date', window_days: 60 }]) {
      const { title, body } = renderNotification(makeReceipt('lifecycle_dormant', payload), undefined, 'UTC')
      expect(title).toBe('Your sites have gone quiet')
      expect(body).toBe('None of your sites has sent data for a long time.')
      expect(body).not.toMatch(/Invalid Date/)
    }
  })

  it('lifecycle_dormant has its own icon rather than the unknown-type fallback', () => {
    expect(getTypeIcon('lifecycle_dormant')).not.toEqual(getTypeIcon('a_type_that_does_not_exist'))
  })
})

describe('lifecycle_install_stalled (PULSE-66)', () => {
  const resolvers = { resolveSiteName: () => 'Example Site', resolveUserName: () => '' }
  const payload = { site_id: 's1', site_created_at: '2026-09-01T08:00:00Z', domain: 'example.com' }

  // The email's words (Iris render.go, typeLifecycleInstallStalled).
  it('says what the email says, naming the site the dashboard knows', () => {
    const { title, body, linkLabel } = renderNotification(makeReceipt('lifecycle_install_stalled', payload), resolvers)
    expect(title).toBe('Pulse has not heard from your site')
    expect(body).toBe('You added Example Site to Pulse and it has not sent any data yet.')
    expect(linkLabel).toBe('Check your install')
    expectHouseVoice(`${title} ${body} ${linkLabel}`)
  })

  it('names the site by the payload domain when it cannot resolve one', () => {
    const { body } = renderNotification(makeReceipt('lifecycle_install_stalled', payload))
    expect(body).toBe('You added example.com to Pulse and it has not sent any data yet.')
  })

  it('says "a site" when it has no name at all', () => {
    const { body } = renderNotification(makeReceipt('lifecycle_install_stalled', { site_created_at: '2026-09-01T08:00:00Z' }))
    expect(body).toBe('You added a site to Pulse and it has not sent any data yet.')
  })

  // site_created_at is stated nowhere and never turned into an age: a send that
  // ran late must tell the same story as a prompt one.
  it('states no age, however long ago the site was added', () => {
    const { title, body } = renderNotification(makeReceipt('lifecycle_install_stalled', { site_created_at: '2025-01-01T00:00:00Z' }))
    expect(`${title} ${body}`).not.toMatch(/\d/)
  })

  it('is its own card, not the fallback, and has its own icon', () => {
    const { title } = renderNotification(makeReceipt('lifecycle_install_stalled', payload))
    expect(title).not.toBe('lifecycle_install_stalled')
    expect(getTypeIcon('lifecycle_install_stalled')).not.toEqual(getTypeIcon('a_type_that_does_not_exist'))
  })
})

describe('the generic fallback', () => {
  const GENERIC = 'A new notification in Pulse.'

  // PULSE-67: the registry's label, exactly as the email's generic arm titles
  // itself "Pulse — <display name>". The body is the email's generic line
  // (PULSE-59, E4): Pulse, never a workspace.
  it('titles a type with no renderer by its registry label, never its type key', () => {
    const r = renderNotification(makeReceipt('a_type_that_does_not_exist', {}, 'Something happened'))
    expect(r).toEqual({ title: 'Something happened', body: GENERIC, linkLabel: null })
  })

  it('without a label, names Pulse in the title and still never shows the type key', () => {
    for (const label of [undefined, null, '', '   ']) {
      const { title, body } = renderNotification(makeReceipt('a_type_that_does_not_exist', {}, label))
      expect(title).toBe(GENERIC)
      expect(body).toBe('')
      expect(title).not.toContain('a_type_that_does_not_exist')
    }
  })

  it('gives a renderer that throws on a malformed payload the same labelled row', () => {
    // A payload whose field cannot be read stands in for any malformed one.
    const malformed = { get user_id(): string { throw new Error('malformed payload') } }
    const labelled = renderNotification(makeReceipt('team_member_joined', malformed, 'Someone joined'))
    expect(labelled).toEqual({ title: 'Someone joined', body: GENERIC, linkLabel: null })
    const bare = renderNotification(makeReceipt('team_member_joined', malformed))
    expect(bare.title).toBe(GENERIC)
    expect(bare.title).not.toContain('team_member_joined')
  })
})
