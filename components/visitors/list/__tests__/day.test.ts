import { describe, it, expect } from 'vitest'
import type { VisitEvent, VisitRow, VisitorDayVisit } from '@/lib/api/visitors'
import { campaignOf, dayPages, isOwnEvent, ownNamesOf, readableEvent, sourceOf, stepsByVisit } from '../day'

// The new Visitors page's readings of a listed visitor's day (rulings R101 to R114): what is the site's own event, a
// day as pages, the names the Events figure lists, and each visit's steps matched to the visits read.

const pv = (timestamp: string, path: string, duration: number | null = 10): VisitEvent => ({ timestamp, type: 'pageview', event_name: 'pageview', path, duration, scroll_depth: null })
const ev = (timestamp: string, event_name: string, path = '/', properties?: Record<string, string>): VisitEvent => ({ timestamp, type: 'custom', event_name, path, properties, duration: null, scroll_depth: null })
const visit = (visit_key: string, started_at: string): VisitRow => ({ visit_key, started_at, ended_at: started_at, duration_seconds: 30, pageviews: 1, events: 0, entry_path: '/', exit_path: '/', referrer: null })

describe('isOwnEvent', () => {
  it('is any custom event the dashboard does not call automatic', () => {
    expect(isOwnEvent(ev('t', 'signup'))).toBe(true)
    expect(isOwnEvent(ev('t', 'outbound_link'))).toBe(false)
    expect(isOwnEvent(ev('t', 'file_download'))).toBe(false)
    expect(isOwnEvent(ev('t', '404'))).toBe(false)
    expect(isOwnEvent(ev('t', 'pulse_click'))).toBe(false)
    expect(isOwnEvent(pv('t', '/'))).toBe(false)
  })
})

describe('readableEvent', () => {
  it('writes a stored name as the dashboard does, and a 404 in words', () => {
    expect(readableEvent('trial_started')).toBe('Trial started')
    expect(readableEvent('404')).toBe('Page not found')
    expect(readableEvent('_')).toBe('_')
  })
})

describe('dayPages', () => {
  it('makes each pageview a page and hangs each event on the page before it', () => {
    const day: VisitorDayVisit[] = [
      { steps: [pv('2026-11-20T10:00:00Z', '/'), ev('2026-11-20T10:00:05Z', 'signup'), pv('2026-11-20T10:01:00Z', '/pricing', 40)] },
      { steps: [ev('2026-11-20T12:00:00Z', 'newsletter', '/blog'), pv('2026-11-20T12:00:01Z', '/blog')] },
    ]
    const pages = dayPages(day)
    expect(pages.map((v) => v.map((p) => p.path))).toEqual([['/', '/pricing'], ['/blog', '/blog']])
    expect(pages[0][0].items.map((i) => [i.text, i.own])).toEqual([['signup', true]])
    expect(pages[0][1].seconds).toBe(40)
    // An event before any pageview opens a page of its own, at the address it was sent from.
    expect(pages[1][0].seconds).toBeNull()
    expect(pages[1][0].items[0].own).toBe(true)
  })

  it('draws an automatic event the trail cannot read as plain, never as the site\'s own', () => {
    const [[page]] = dayPages([{ steps: [pv('2026-11-20T10:00:00Z', '/gone'), ev('2026-11-20T10:00:01Z', '404', '/gone')] }])
    expect(page.items[0]).toMatchObject({ kind: 'event', own: false, plain: true, text: 'Page not found' })
  })

  it('reads no day as no pages', () => {
    expect(dayPages(undefined)).toEqual([])
  })
})

describe('ownNamesOf', () => {
  it('lists the site\'s own events once each, readable, in the order they first fired', () => {
    const day: VisitorDayVisit[] = [
      { steps: [pv('a', '/'), ev('b', 'trial_started'), ev('c', 'outbound_link', '/', { url: 'https://x.test' })] },
      { steps: [pv('d', '/'), ev('e', 'signup'), ev('f', 'trial_started')] },
    ]
    expect(ownNamesOf(day)).toEqual(['Trial started', 'Signup'])
  })
})

describe('stepsByVisit', () => {
  it('gives each visit the day\'s steps that start when it does, and none to a visit past the day\'s cap', () => {
    const first = [pv('2026-11-20T10:00:00Z', '/')]
    const second = [pv('2026-11-20T12:00:00Z', '/b')]
    const map = stepsByVisit(
      [visit('s:1', '2026-11-20T10:00:00Z'), visit('s:2', '2026-11-20T12:00:00.000Z'), visit('s:3', '2026-11-20T15:00:00Z')],
      [{ steps: first }, { steps: second }],
    )
    expect(map.get('s:1')).toBe(first)
    expect(map.get('s:2')).toBe(second)
    expect(map.get('s:3')).toEqual([])
  })
})

describe('campaignOf and sourceOf', () => {
  it('shows a campaign only with a name, and Direct where there is no referrer', () => {
    expect(campaignOf({ utm_source: 'newsletter', utm_medium: 'email', utm_campaign: 'autumn' })).toEqual({ campaign: 'autumn', source: 'newsletter', medium: 'email' })
    expect(campaignOf({ utm_source: 'newsletter', utm_medium: null, utm_campaign: null })).toBeNull()
    expect(campaignOf(undefined)).toBeNull()
    expect(sourceOf(null)).toBe('Direct')
    expect(sourceOf('Google')).toBe('Google')
  })
})
