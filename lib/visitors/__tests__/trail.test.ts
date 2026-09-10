import { describe, it, expect } from 'vitest'
import {
  autoSentence,
  chipProps,
  countByKind,
  downloadName,
  groupTrail,
  kindOf,
  prettyDestination,
  TRAIL_KINDS,
  type TrailKind,
} from '../trail'
import type { VisitEvent } from '@/lib/api/visitors'

const ALL = new Set<TrailKind>(TRAIL_KINDS)

function ev(
  name: string,
  path: string | null,
  timestamp: string,
  properties?: Record<string, string>,
  duration: number | null = null,
): VisitEvent {
  return {
    timestamp,
    type: name === 'pageview' ? 'pageview' : 'custom',
    event_name: name,
    path,
    properties,
    duration,
    scroll_depth: null,
  }
}

/**
 * The REAL trail the round-6 decision was taken on: visitor 6801e7f4… on
 * pulse.ciphera.net, 10-09-2026, read out of production. 17 events, 8 of them
 * pageviews — the visit the owner screenshotted and read as pages printed twice.
 *
 * Timestamps are the measured microsecond values, because two of the pairs are
 * only 374ms and 420ms apart and that gap is the whole point of one test below.
 */
const REAL_TRAIL: VisitEvent[] = [
  ev('pageview', '/', '2026-09-10T12:24:38.000Z', undefined, 11),
  ev('login_flow_started', '/', '2026-09-10T12:24:49.000Z'),
  ev('pageview', '/auth/callback', '2026-09-10T12:25:53.000Z', undefined, 3),
  ev('pageview', '/setup/site', '2026-09-10T12:25:58.000Z', undefined, 9),
  ev('welcome_step_view', '/setup/site', '2026-09-10T12:25:59.000Z', { step: '2', step_name: 'site' }),
  ev('welcome_site_added', '/setup/site', '2026-09-10T12:26:24.508Z', { added_site: 'true' }),
  ev('pageview', '/setup/install', '2026-09-10T12:26:24.882Z', undefined, 10),
  ev('welcome_step_view', '/setup/install', '2026-09-10T12:26:24.906Z', { step: '3', step_name: 'install' }),
  ev('welcome_install_skipped', '/setup/install', '2026-09-10T12:26:34.809Z'),
  ev('pageview', '/setup/plan', '2026-09-10T12:26:35.229Z', undefined, 4),
  ev('welcome_step_view', '/setup/plan', '2026-09-10T12:26:35.237Z', { step: '4', step_name: 'plan' }),
  ev('pageview', '/sites', '2026-09-10T12:27:11.000Z', undefined, 2),
  ev('pageview', '/setup/install', '2026-09-10T12:27:13.000Z', undefined, 4),
  ev('welcome_step_view', '/setup/install', '2026-09-10T12:27:13.100Z', { step: '3', step_name: 'install' }),
  ev('welcome_install_skipped', '/setup/install', '2026-09-10T12:27:16.733Z'),
  ev('pageview', '/setup/plan', '2026-09-10T12:27:17.096Z', undefined, 4),
  ev('welcome_step_view', '/setup/plan', '2026-09-10T12:27:17.111Z', { step: '4', step_name: 'plan' }),
]

describe('kindOf and the schema guard', () => {
  it('gives a sentence to an outbound_link with EXACTLY our shape', () => {
    const e = ev('outbound_link', '/pricing', 't', { url: 'https://stripe.com/pricing', page_path: '/pricing' })
    expect(kindOf(e)).toBe('outbound')
    expect(autoSentence(e)).toBe('Left for stripe.com/pricing')
  })

  it('gives a sentence to a file_download and names the FILE', () => {
    const e = ev('file_download', '/docs', 't', { url: 'https://ciphera.net/files/price-list.pdf', page_path: '/docs' })
    expect(kindOf(e)).toBe('download')
    expect(autoSentence(e)).toBe('Downloaded price-list.pdf')
  })

  /**
   * 🔴 THE PRODUCTION COUNTER-EXAMPLE. A customer emits an event named
   * `outbound_click` whose properties are {brand, garment, surface} — a fashion
   * site's product event with nothing to do with outbound links. A renderer that
   * inferred meaning from the NAME would describe it wrongly. This is why the
   * guard is a schema match and not a name match.
   */
  it('refuses to describe a customer event that merely SOUNDS like ours', () => {
    const e = ev('outbound_click', '/shop', 't', { brand: 'Acme', garment: 'coat', surface: 'grid' })
    expect(kindOf(e)).toBe('event')
    expect(autoSentence(e)).toBeNull()
    // and it keeps every property, because that is all we can honestly show
    expect(chipProps(e)).toHaveLength(3)
    // The mutation this defends against is a PREFIX or substring match on the
    // name ("anything containing outbound is an outbound click"), which is the
    // plausible sloppy implementation. Names that share a stem must all miss.
    for (const name of ['outbound_click', 'outbound', 'outbound_link_v2', 'my_file_download']) {
      expect(autoSentence(ev(name, '/x', 't', { url: 'https://x.test/', page_path: '/x' }))).toBeNull()
    }
  })

  it('refuses our OWN name when the shape carries an extra key', () => {
    const e = ev('outbound_link', '/x', 't', { url: 'https://a.test/', page_path: '/x', campaign: 'spring' })
    expect(kindOf(e)).toBe('event')
    expect(autoSentence(e)).toBeNull()
  })

  it('refuses our own name when the required property is missing or empty', () => {
    expect(autoSentence(ev('outbound_link', '/x', 't', { page_path: '/x' }))).toBeNull()
    expect(autoSentence(ev('outbound_link', '/x', 't', { url: '', page_path: '/x' }))).toBeNull()
    expect(autoSentence(ev('outbound_link', '/x', 't'))).toBeNull()
  })

  it('renders NO chips for a described event — the sentence already says it', () => {
    // page_path duplicates the row's own path; url is in the sentence.
    const e = ev('outbound_link', '/pricing', 't', { url: 'https://stripe.com/pricing', page_path: '/pricing' })
    expect(chipProps(e)).toEqual([])
  })

  it('survives a url that will not parse, without producing an empty label', () => {
    const e = ev('outbound_link', '/x', 't', { url: 'not a url', page_path: '/x' })
    expect(autoSentence(e)).toBe('Left for not a url')
    expect(prettyDestination('not a url')).toBe('not a url')
    expect(downloadName('not a url')).toBe('not a url')
  })

  it('drops the scheme and a bare trailing slash from a destination', () => {
    expect(prettyDestination('https://example.com/')).toBe('example.com')
    expect(prettyDestination('https://example.com/a/b/')).toBe('example.com/a/b')
  })
})

describe('groupTrail', () => {
  it('turns the real 17-step trail into 8 page rows', () => {
    const groups = groupTrail(REAL_TRAIL, ALL)
    expect(groups).toHaveLength(8)
    expect(groups.every((g) => g.page !== null)).toBe(true)
    expect(groups.map((g) => g.path)).toEqual([
      '/', '/auth/callback', '/setup/site', '/setup/install', '/setup/plan',
      '/sites', '/setup/install', '/setup/plan',
    ])
    // every event is still on screen — grouping hides nothing
    expect(groups.reduce((n, g) => n + g.events.length, 0)).toBe(9)
  })

  it('keeps BOTH real visits to a repeated path as separate rows', () => {
    const groups = groupTrail(REAL_TRAIL, ALL)
    const installs = groups.filter((g) => g.path === '/setup/install')
    expect(installs).toHaveLength(2)
    // and each keeps its own dwell, which is how they are told apart
    expect(installs.map((g) => g.dwell)).toEqual([10, 4])
  })

  /**
   * 🔑 An event belongs to the most recent PRECEDING pageview. Measured:
   * `welcome_site_added` fired on /setup/site at 12:26:24.508 and the
   * /setup/install pageview arrived 374ms later. Grouping forwards would file
   * the event under the page the visitor was navigating TO.
   */
  it('attaches an event to the page that was OPEN, not the one arriving 374ms later', () => {
    const groups = groupTrail(REAL_TRAIL, ALL)
    const site = groups.find((g) => g.path === '/setup/site')!
    expect(site.events.map((e) => e.event_name)).toEqual(['welcome_step_view', 'welcome_site_added'])
    const install = groups.find((g) => g.path === '/setup/install')!
    expect(install.events.map((e) => e.event_name)).toEqual(['welcome_step_view', 'welcome_install_skipped'])
  })

  /**
   * 🔴 THE CASE THAT ACTUALLY PINS THE DIRECTION. The test above does not: in
   * the real trail every event's path already equals the open page's, so the
   * path check does all the work and a forward-grouping implementation passes it
   * unchanged — found by mutation-testing, not by reading.
   *
   * Here the event's path matches the pageview that comes AFTER it and not the
   * one that is open. Grouping backwards (correct) refuses to attach it and
   * gives it its own row; grouping forwards would file it under /b.
   */
  it('does not attach an event to a page that had not loaded yet', () => {
    const trail = [
      ev('pageview', '/a', 't1', undefined, 5),
      ev('thing_happened', '/b', 't2', { k: 'v' }),
      ev('pageview', '/b', 't3', undefined, 7),
    ]
    const groups = groupTrail(trail, ALL)
    expect(groups.map((g) => [g.path, g.page !== null, g.events.length])).toEqual([
      ['/a', true, 0],
      ['/b', false, 1],
      ['/b', true, 0],
    ])
  })

  it('gives an event its OWN row when its path disagrees with the open page', () => {
    const trail = [
      ev('pageview', '/a', 't1', undefined, 5),
      ev('thing_happened', '/somewhere-else', 't2', { k: 'v' }),
    ]
    const groups = groupTrail(trail, ALL)
    expect(groups).toHaveLength(2)
    expect(groups[1].page).toBeNull()
    expect(groups[1].path).toBe('/somewhere-else')
    expect(groups[1].dwell).toBeNull()
  })

  it('attaches an event with a NULL path — there is nothing to disagree with', () => {
    // A site that does not collect page paths (D7): the server nulls them out.
    const trail = [ev('pageview', null, 't1', undefined, 5), ev('thing', null, 't2')]
    const groups = groupTrail(trail, ALL)
    expect(groups).toHaveLength(1)
    expect(groups[0].events).toHaveLength(1)
  })

  it('gives an event its own row when no pageview precedes it', () => {
    const groups = groupTrail([ev('early_thing', '/a', 't1')], ALL)
    expect(groups).toHaveLength(1)
    expect(groups[0].page).toBeNull()
  })

  it('with Pages filtered OFF, every surviving event becomes its own row', () => {
    const groups = groupTrail(REAL_TRAIL, new Set<TrailKind>(['event']))
    expect(groups).toHaveLength(9)
    expect(groups.every((g) => g.page === null)).toBe(true)
  })

  it('with Events filtered off, the page rows survive and carry no events', () => {
    const groups = groupTrail(REAL_TRAIL, new Set<TrailKind>(['pageview']))
    expect(groups).toHaveLength(8)
    expect(groups.every((g) => g.events.length === 0)).toBe(true)
  })
})

describe('countByKind', () => {
  it('counts the real trail as 8 pages and 9 events', () => {
    expect(countByKind(REAL_TRAIL)).toEqual({ pageview: 8, outbound: 0, download: 0, event: 9 })
  })

  it('separates our two auto-captured kinds from customer events', () => {
    const trail = [
      ev('pageview', '/a', 't1'),
      ev('outbound_link', '/a', 't2', { url: 'https://x.test/', page_path: '/a' }),
      ev('file_download', '/a', 't3', { url: 'https://x.test/f.pdf', page_path: '/a' }),
      ev('outbound_click', '/a', 't4', { brand: 'Acme' }),
    ]
    expect(countByKind(trail)).toEqual({ pageview: 1, outbound: 1, download: 1, event: 1 })
  })
})
