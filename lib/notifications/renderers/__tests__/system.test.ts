import { describe, it, expect } from 'vitest'
import { renderNotification } from '../index'
import type { Receipt } from '@/lib/notifications/types'

// Rewritten 29-08-2026. The previous version of this file asserted that
// system_announcement's body contained the announcement id — it pinned the
// broken contract in place, which is why a renderer that could only ever
// produce "Announcement #<id>." survived review. Warden has always sent
// {title, body}; these tests assert the operator's actual words reach the
// reader.

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

describe('system_announcement', () => {
  it("renders the operator's own title and body", () => {
    const r = makeReceipt('system_announcement', {
      title: 'Scheduled API deprecation',
      body: 'The v0 export endpoint retires on 1 October.',
    })
    const { title, body } = renderNotification(r)
    expect(title).toBe('Scheduled API deprecation')
    expect(body).toBe('The v0 export endpoint retires on 1 October.')
  })

  // The defect this whole change exists to remove: a notification that names a
  // record instead of saying something.
  it('never renders an id reference', () => {
    const r = makeReceipt('system_announcement', {
      title: 'Maintenance complete',
      body: 'All services are back to normal.',
    })
    const { body } = renderNotification(r)
    expect(body).not.toContain('#')
    expect(body).not.toMatch(/announcement_id|undefined/i)
  })

  it('falls back to a usable title rather than an empty heading', () => {
    const r = makeReceipt('system_announcement', { title: '   ', body: 'Body only.' })
    expect(renderNotification(r).title).toBe('Announcement')
  })

  // The dead link label: admin.go passes nil for link_url, and NotificationRow
  // only draws a link when linkUrl is set, so 'See release notes' had never
  // once rendered.
  it('claims no link', () => {
    const r = makeReceipt('system_announcement', { title: 'T', body: 'B' })
    expect(renderNotification(r).linkLabel).toBeNull()
  })
})

describe('system_maintenance', () => {
  it('renders title, body and the window when one is supplied', () => {
    const r = makeReceipt('system_maintenance', {
      title: 'Database upgrade',
      body: 'Dashboards will be read-only.',
      starts_at: '2026-04-20T02:00:00Z',
      ends_at: '2026-04-20T04:00:00Z',
    })
    const { title, body } = renderNotification(r)
    expect(title).toBe('Database upgrade')
    expect(body).toContain('Dashboards will be read-only.')
    expect(body).toContain('–')
  })

  // The Warden composer collects no dates, so this is the shape that actually
  // ships today. Formatting an absent window used to put the literal
  // "Invalid Date" in front of the reader.
  it('degrades cleanly with no window at all', () => {
    const r = makeReceipt('system_maintenance', {
      title: 'Planned downtime',
      body: 'We will post an update here when it is done.',
    })
    const { title, body } = renderNotification(r)
    expect(title).toBe('Planned downtime')
    expect(body).toBe('We will post an update here when it is done.')
    expect(title + body).not.toContain('Invalid Date')
  })

  it('never prints Invalid Date for an unparseable window', () => {
    const r = makeReceipt('system_maintenance', {
      title: 'Planned downtime',
      body: 'Body.',
      starts_at: 'not-a-date',
      ends_at: 'also-not-a-date',
    })
    const { title, body } = renderNotification(r)
    expect(title + body).not.toContain('Invalid Date')
  })

  it('falls back to a dated default title when none is given', () => {
    const r = makeReceipt('system_maintenance', {
      title: '',
      body: 'B',
      starts_at: '2026-04-20T02:00:00Z',
      ends_at: '2026-04-20T04:00:00Z',
    })
    expect(renderNotification(r).title).toContain('Scheduled maintenance')
  })
})
