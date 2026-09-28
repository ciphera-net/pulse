import { describe, it, expect } from 'vitest'
import { renderNotification } from '../index'
import { getTypeIcon } from '@/lib/utils/notifications'
import type { Receipt, SiteImportStoppedPayload } from '@/lib/notifications/types'

function makeReceipt<T>(type: string, payload: T, typeDisplayName?: string | null): Receipt {
  return {
    user_id: 'u', event_id: 'e', delivered_at: null, read_at: null,
    type_display_name: typeDisplayName,
    event: {
      id: 'e', organization_id: 'o', type: type as any, payload: payload as any,
      link_url: null, link_label_key: null,
      created_at: '2026-04-15T12:00:00Z', expires_at: '2026-07-14T12:00:00Z',
    },
  }
}

// The same guards the email copy follows (§3.10c "Copy options"): no em/en
// dash, no contraction (this also catches a possessive 's, e.g. "Pulse's"),
// no "!". The card never names the workspace either (D5/voice.md), though
// these payloads carry no workspace field to begin with.
const VOICE = { dash: /[—–]/, contraction: /\b\w+'(t|s|re|ve|ll|d|m)\b/i, bang: /!/ }
function expectHouseVoice(text: string) {
  expect(text).not.toMatch(VOICE.dash)
  expect(text).not.toMatch(VOICE.contraction)
  expect(text).not.toMatch(VOICE.bang)
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

// PULSE-121, design §3.10c: the analytics-history import's two types.
// Payloads carry a domain, never a site_id or a workspace name (M13-g), so
// these renderers take no resolvers.
describe('site_import_completed (PULSE-121)', () => {
  const payload = {
    domain: 'example.com', source: 'matomo', source_name: 'Matomo',
    range_start: '2025-01-01', range_end: '2026-09-14',
  }

  it('names the source, the domain and the range as the site-local day (C1 variant A, shortened)', () => {
    const { title, body, linkLabel } = renderNotification(makeReceipt('site_import_completed', payload))
    expect(title).toBe('Your Matomo history is in Pulse')
    expect(body).toBe('Pulse finished importing the history of example.com from Matomo, 01/01/2025 to 14/09/2026.')
    expect(linkLabel).toBe('View import')
    expectHouseVoice(`${title} ${body}`)
  })

  // formatCalendarDate reads the digits straight out of the wire string: a
  // range_start/range_end this test pins under a positive UTC offset (the
  // tz-positive CI pass) must still read the SAME day, never shifted by a
  // runtime or viewer timezone.
  it('never shifts the range under a non-UTC runtime timezone', () => {
    const { body } = renderNotification(makeReceipt('site_import_completed', payload))
    expect(body).toContain('01/01/2025')
    expect(body).toContain('14/09/2026')
  })

  it('has its own icon, distinct from the fallback and from site_import_stopped', () => {
    expect(getTypeIcon('site_import_completed')).not.toEqual(getTypeIcon('a_type_that_does_not_exist'))
    expect(getTypeIcon('site_import_completed')).not.toEqual(getTypeIcon('site_import_stopped'))
  })

  it('degrades to the generic fallback on a malformed payload rather than throwing', () => {
    const malformed = { domain: 'example.com' } // no source_name, no range
    const r = renderNotification(makeReceipt('site_import_completed', malformed, 'Import finished'))
    expect(r).toEqual({ title: 'Import finished', body: 'A new notification in Pulse.', linkLabel: null })
  })
})

describe('site_import_stopped (PULSE-121)', () => {
  const base = { domain: 'example.com', source: 'matomo', source_name: 'Matomo', stopped_on: '2026-09-27' }

  // C2 variant A, one sentence per cause (M13-j: "copy ships for every code
  // now"), shortened for a row: the fact and the reason, never the "how to
  // fix it on the Import tab" sentence the row's own click target already is.
  const CASES: Array<{ code: SiteImportStoppedPayload['code']; payload: Partial<SiteImportStoppedPayload>; title: string; body: string }> = [
    {
      code: 'upload_abandoned',
      payload: { ...base, source: 'plausible', source_name: 'Plausible', part: 5, parts: 38 },
      title: 'Your Plausible import stopped at part 5 of 38',
      body: 'The Plausible upload for example.com stopped at part 5 of 38 on 27/09/2026, because the tab running it was closed. Choose the same file and it carries on where it stopped.',
    },
    {
      code: 'reconnect_required',
      payload: base,
      title: 'Matomo stopped accepting the import connection',
      body: 'The Matomo import for example.com stopped on 27/09/2026, because Matomo no longer accepts the connection from Pulse.',
    },
    {
      code: 'source_unavailable',
      payload: base,
      title: 'Matomo stopped answering the import',
      body: 'The Matomo import for example.com stopped on 27/09/2026, because Matomo kept failing to answer.',
    },
    {
      code: 'connector_erased',
      payload: base,
      title: 'The Matomo import for example.com needs a new connection',
      body: 'The import stopped on 27/09/2026, because the account that connected Matomo was deleted.',
    },
    {
      code: 'user_metrics_disabled',
      payload: { ...base, source: 'ga4', source_name: 'Google Analytics' },
      title: 'Google Analytics blocked the visitor counts',
      body: 'The Google Analytics import for example.com stopped on 27/09/2026, because user metrics are turned off for that property.',
    },
  ]

  it.each(CASES)('$code — the fact, the reason, and the site-local stop day', ({ code, payload, title, body }) => {
    const r = renderNotification(makeReceipt('site_import_stopped', { ...payload, code }))
    expect(r.title).toBe(title)
    expect(r.body).toBe(body)
    expect(r.linkLabel).toBe('View import')
    expectHouseVoice(`${r.title} ${r.body}`)
  })

  // M13-g: part/parts exist ONLY for upload_abandoned. Every other cause's
  // card must say nothing about a part, or a viewer would read "part" and
  // look for a number that was never sent.
  it.each(CASES.filter((c) => c.code !== 'upload_abandoned'))('$code — never mentions a part', ({ payload, code }) => {
    const r = renderNotification(makeReceipt('site_import_stopped', { ...payload, code }))
    expect(`${r.title} ${r.body}`.toLowerCase()).not.toContain('part')
  })

  // Mutation check for the upload_abandoned branch's own guard: a payload
  // that claims the cause but omits part/parts (the exact shape M13-g's
  // pointer fields make possible on a malformed producer) must degrade to
  // the generic card, never print "part undefined of undefined".
  it('upload_abandoned with no part/parts degrades to the generic fallback', () => {
    const malformed = { ...base, code: 'upload_abandoned' as const }
    const r = renderNotification(makeReceipt('site_import_stopped', malformed, 'Import stopped'))
    expect(r).toEqual({ title: 'Import stopped', body: 'A new notification in Pulse.', linkLabel: null })
  })

  it('a payload missing a required field degrades to the generic fallback rather than printing "undefined"', () => {
    const r = renderNotification(makeReceipt('site_import_stopped', { code: 'reconnect_required' }, 'Import stopped'))
    expect(r).toEqual({ title: 'Import stopped', body: 'A new notification in Pulse.', linkLabel: null })
  })

  it('an unrecognised code degrades to the generic fallback rather than a blank card', () => {
    const r = renderNotification(makeReceipt('site_import_stopped', { ...base, code: 'not_a_real_code' }, 'Import stopped'))
    expect(r).toEqual({ title: 'Import stopped', body: 'A new notification in Pulse.', linkLabel: null })
  })

  it('has its own icon, distinct from the fallback and from site_import_completed', () => {
    expect(getTypeIcon('site_import_stopped')).not.toEqual(getTypeIcon('a_type_that_does_not_exist'))
    expect(getTypeIcon('site_import_stopped')).not.toEqual(getTypeIcon('site_import_completed'))
  })
})
