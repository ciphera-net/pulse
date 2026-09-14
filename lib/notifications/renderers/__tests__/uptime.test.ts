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

  it('site_install_silent — names the site and states the last-event instant, never a computed age', () => {
    const r = makeReceipt('site_install_silent', { site_id: 's-1', last_event_at: '2026-09-01T09:30:00Z', domain: 'example.com' })
    const { title, body, linkLabel } = renderNotification(r)
    expect(title).toContain('Tracking script went quiet')
    expect(title).toContain('example.com')
    expect(body).toMatch(/No events since .*2026/)
    expect(body).not.toMatch(/ago/)
    expect(linkLabel).toBe('View site')
  })

  it('site_install_silent — an unparseable instant degrades to a true sentence, never an Invalid Date', () => {
    const r = makeReceipt('site_install_silent', { site_id: 's-1', last_event_at: 'not-a-date' })
    const { body } = renderNotification(r)
    expect(body).toBe('Events have stopped arriving.')
    expect(body).not.toContain('Invalid')
  })

  it('site_install_recovered — body carries the formatted silence from the payload', () => {
    const r = makeReceipt('site_install_recovered', { site_id: 's-1', silent_seconds: 3 * 24 * 3600 })
    const { title, body } = renderNotification(r)
    expect(title).toContain('Tracking script is back')
    expect(body).toContain('arriving again after')
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

describe('site_events_rejected (iris migration 028)', () => {
  it('names the site and spells out every recognised cause, inventing none', () => {
    const r = makeReceipt('site_events_rejected', {
      site_id: 's1', causes: ['plan_ceiling', 'outdated_script'], domain: 'example.com',
    })
    const { title, body } = renderNotification(r)
    expect(title).toBe("Some events weren't counted — example.com")
    expect(body).toContain("plan's event limit was reached")
    expect(body).toContain('tracking script needs updating')
    expect(body).not.toContain('faster than your plan allows')
  })

  it('SKIPS an unrecognised cause rather than echoing it', () => {
    // The payload schema's enum stops a drop-reason slug at produce time. This is
    // the second line of that defence: a renderer that printed whatever it was
    // given would publish the internal taxonomy the day a producer bug got one
    // past the schema.
    const r = makeReceipt('site_events_rejected', {
      site_id: 's1', causes: ['rate_limited', 'quarantined', 'over_hard_ceiling'],
    })
    const { body } = renderNotification(r)
    expect(body).not.toContain('quarantined')
    expect(body).not.toContain('over_hard_ceiling')
    expect(body).toContain('faster than your plan allows')
  })

  it('degrades to a true sentence when every cause is unknown or absent', () => {
    for (const payload of [
      { site_id: 's1', causes: ['nonsense'] },
      { site_id: 's1', causes: [] },
      { site_id: 's1' },
    ]) {
      const { title, body } = renderNotification(makeReceipt('site_events_rejected', payload))
      expect(body).toBe('Some events from the last 7 days were refused.')
      expect(title).toContain("Some events weren't counted")
    }
  })

  it('falls back to the site id when there is no domain', () => {
    const { title } = renderNotification(makeReceipt('site_events_rejected', { site_id: 'abc', causes: ['plan_ceiling'] }))
    expect(title).toContain('site abc')
  })
})
