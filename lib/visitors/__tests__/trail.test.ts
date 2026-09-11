import { describe, it, expect } from 'vitest'
import {
  autoSentence,
  orderTrail,
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
    expect(countByKind(REAL_TRAIL)).toEqual({
      pageview: 8, click: 0, copy: 0, form: 0, outbound: 0, download: 0, event: 9,
    })
  })

  it('separates our two auto-captured kinds from customer events', () => {
    const trail = [
      ev('pageview', '/a', 't1'),
      ev('outbound_link', '/a', 't2', { url: 'https://x.test/', page_path: '/a' }),
      ev('file_download', '/a', 't3', { url: 'https://x.test/f.pdf', page_path: '/a' }),
      ev('outbound_click', '/a', 't4', { brand: 'Acme' }),
    ]
    expect(countByKind(trail)).toEqual({
      pageview: 1, click: 0, copy: 0, form: 0, outbound: 1, download: 1, event: 1,
    })
  })
})

describe('round 7 — the three types the companion records', () => {
  it('describes a click and NAMES THE CONTROL', () => {
    const link = ev('pulse_click', '/', 't', { text: 'Explore Products', tag: 'a', page_path: '/' })
    expect(kindOf(link)).toBe('click')
    expect(autoSentence(link)).toBe('Clicked the link \u201cExplore Products\u201d')

    const button = ev('pulse_click', '/login', 't', { text: 'Sign in', tag: 'button', page_path: '/login' })
    expect(autoSentence(button)).toBe('Clicked the button \u201cSign in\u201d')

    // A role=button on something else reports its own tag. The noun must never
    // be an empty string in the middle of a sentence.
    const div = ev('pulse_click', '/', 't', { text: 'Open', tag: 'div', page_path: '/' })
    expect(autoSentence(div)).toBe('Clicked the control \u201cOpen\u201d')
  })

  it('describes a copy by its COUNT and its SOURCE, and can never quote it', () => {
    const e = ev('pulse_copy', '/', 't', { chars: '29', source_tag: 'p', page_path: '/' })
    expect(kindOf(e)).toBe('copy')
    expect(autoSentence(e)).toBe('Copied 29 characters from a paragraph')
    // 🔴 The payload has no text to leak, and the sentence must not invent one.
    expect(autoSentence(e)).not.toMatch(/\u201c|\u201d/)

    expect(autoSentence(ev('pulse_copy', '/', 't', { chars: '1', source_tag: 'p', page_path: '/' })))
      .toBe('Copied 1 character from a paragraph') // singular
    expect(autoSentence(ev('pulse_copy', '/', 't', { chars: '1350', source_tag: 'li', page_path: '/' })))
      .toBe('Copied 1,350 characters from a list item') // grouped
    expect(autoSentence(ev('pulse_copy', '/', 't', { chars: '12', source_tag: 'h2', page_path: '/' })))
      .toBe('Copied 12 characters from a heading')
    // An unmapped source is "the page", never an empty noun.
    expect(autoSentence(ev('pulse_copy', '/', 't', { chars: '12', source_tag: 'section', page_path: '/' })))
      .toBe('Copied 12 characters from the page')
  })

  /**
   * 🔴 Measured over every such row in production: `pulse_form_submit` carries
   * {fields, page_path} and NOTHING ELSE. No form on any of our sites has an id
   * or a name — ciphera.net/contact is 8 unnamed fields, the ID login form 5 —
   * so the unnamed wording is the NORMAL case, not the fallback.
   */
  it('describes a form submit without a name, because no form has one', () => {
    const e = ev('pulse_form_submit', '/login', 't', { fields: '5', page_path: '/login' })
    expect(kindOf(e)).toBe('form')
    expect(autoSentence(e)).toBe('Submitted a form with 5 fields')
    expect(autoSentence(ev('pulse_form_submit', '/x', 't', { fields: '1', page_path: '/x' })))
      .toBe('Submitted a form with 1 field') // singular
  })

  it('names a form when one ever does carry a name', () => {
    expect(autoSentence(ev('pulse_form_submit', '/c', 't', { fields: '4', form_name: 'contact', page_path: '/c' })))
      .toBe('Submitted the \u201ccontact\u201d form with 4 fields')
    // form_name wins over form_id — it is the more human of the two.
    expect(autoSentence(ev('pulse_form_submit', '/c', 't', {
      fields: '4', form_id: 'f1', form_name: 'contact', page_path: '/c',
    }))).toBe('Submitted the \u201ccontact\u201d form with 4 fields')
    expect(autoSentence(ev('pulse_form_submit', '/c', 't', { fields: '4', form_id: 'signup', page_path: '/c' })))
      .toBe('Submitted the \u201csignup\u201d form with 4 fields')
  })

  it('accepts our shape with the optional key present, and with it absent', () => {
    // `id` has never appeared in production, but the shape allows it.
    const withId = ev('pulse_click', '/', 't', { text: 'Go', tag: 'a', id: 'cta', page_path: '/' })
    expect(kindOf(withId)).toBe('click')
    expect(autoSentence(withId)).toBe('Clicked the link \u201cGo\u201d')
  })

  /**
   * 🔴 THE SCHEMA GUARD, ON THE NEW NAMES. The counter-example that made this
   * rule (`outbound_click` with {brand, garment, surface}) applies identically:
   * a customer could emit `pulse_click`, and an extra key means it is not ours.
   */
  it('refuses our new names when the shape carries an extra key', () => {
    for (const [name, props] of [
      ['pulse_click', { text: 'Buy', tag: 'a', page_path: '/', brand: 'Acme' }],
      ['pulse_copy', { chars: '5', source_tag: 'p', page_path: '/', sku: 'x' }],
      ['pulse_form_submit', { fields: '3', page_path: '/', step: '2' }],
    ] as const) {
      const e = ev(name, '/', 't', props as Record<string, string>)
      expect(kindOf(e), name).toBe('event')
      expect(autoSentence(e), name).toBeNull()
      expect(chipProps(e).length, name).toBeGreaterThan(0)
    }
  })

  /**
   * The schema guard checks the KEYS. A count is also arithmetic, and a sentence
   * may not say "Copied NaN characters" or "Copied 1e3 characters", so the value
   * is checked too — and an unusable one costs the event its sentence rather
   * than producing a broken one.
   */
  it('refuses a count that is not a plain integer', () => {
    for (const chars of ['', 'lots', '1e3', '-5', '1.5', '00012345678901234567', ' 12']) {
      expect(autoSentence(ev('pulse_copy', '/', 't', { chars, source_tag: 'p', page_path: '/' })), chars).toBeNull()
    }
    for (const fields of ['', 'three', '-1', '2.0']) {
      expect(autoSentence(ev('pulse_form_submit', '/', 't', { fields, page_path: '/' })), fields).toBeNull()
    }
    // 0 is a real answer — a form with no fields submitted.
    expect(autoSentence(ev('pulse_form_submit', '/', 't', { fields: '0', page_path: '/' })))
      .toBe('Submitted a form with 0 fields')
  })

  it('renders no chips for any of the three, and every chip for a customer event', () => {
    expect(chipProps(ev('pulse_click', '/', 't', { text: 'Go', tag: 'a', page_path: '/' }))).toEqual([])
    expect(chipProps(ev('pulse_copy', '/', 't', { chars: '5', source_tag: 'p', page_path: '/' }))).toEqual([])
    expect(chipProps(ev('pulse_form_submit', '/', 't', { fields: '2', page_path: '/' }))).toEqual([])
    expect(chipProps(ev('my_own_event', '/', 't', { a: '1', b: '2' }))).toHaveLength(2)
  })

  it('counts the new kinds into their own buckets', () => {
    const trail = [
      ev('pageview', '/', 'ta'),
      ev('pulse_click', '/', 'tb', { text: 'A', tag: 'a', page_path: '/' }),
      ev('pulse_click', '/', 'tc', { text: 'B', tag: 'a', page_path: '/' }),
      ev('pulse_copy', '/', 'td', { chars: '9', source_tag: 'p', page_path: '/' }),
      ev('pulse_form_submit', '/', 'te', { fields: '3', page_path: '/' }),
      ev('outbound_click', '/', 'tf', { brand: 'Acme' }),
    ]
    expect(countByKind(trail)).toEqual({
      pageview: 1, click: 2, copy: 1, form: 1, outbound: 0, download: 0, event: 1,
    })
  })
})

describe('orderTrail — the causal order inside one gesture', () => {
  const T = (msOffset: number) => new Date(Date.UTC(2026, 8, 11, 11, 23, 58, msOffset)).toISOString()

  /**
   * 🔴 THE CASE THE OWNER REPORTED, from the real rows on ciphera.net/pricing.
   * The departure was recorded 38.5ms BEFORE the click that caused it, so the
   * trail printed the effect above its cause.
   */
  it('puts the click before the departure it caused', () => {
    const trail = [
      ev('outbound_link', '/pricing', T(541), { url: 'https://pulse.ciphera.net/signup', page_path: '/pricing' }),
      ev('header_cta_get_started', '/pricing', T(580)),
    ]
    expect(orderTrail(trail).map((e) => e.event_name)).toEqual(['header_cta_get_started', 'outbound_link'])
  })

  it('puts the click before the form submit it triggered', () => {
    // The real pair from id.ciphera.net/login: the submit landed 186\u00b5s first.
    const trail = [
      ev('pulse_form_submit', '/login', T(0), { fields: '5', page_path: '/login' }),
      ev('pulse_click', '/login', T(1), { text: 'Sign in', tag: 'button', page_path: '/login' }),
    ]
    expect(orderTrail(trail).map((e) => e.event_name)).toEqual(['pulse_click', 'pulse_form_submit'])
  })

  it('leaves a pair whose order is already causal exactly as it is', () => {
    const trail = [
      ev('header_cta_get_started', '/pricing', T(0)),
      ev('outbound_link', '/pricing', T(40), { url: 'https://x.test/', page_path: '/pricing' }),
    ]
    expect(orderTrail(trail).map((e) => e.event_name)).toEqual(['header_cta_get_started', 'outbound_link'])
  })

  /**
   * 🔴 NEVER MOVE A PAGEVIEW. An outbound_link on /a and the pageview for /b
   * 20ms later are one gesture by the clock, and hoisting the pageview above the
   * departure would file the departure under the page the visitor had not
   * reached yet — which is the grouping bug, arriving from the ordering side.
   */
  /**
   * 🔴 THE FIXTURE USES NULL PATHS, AND THAT IS THE POINT. The first version of
   * this test put the pageview on a DIFFERENT path, so the cluster's same-path
   * condition refused it and the pageview guard did nothing — removing the guard
   * left the test green. Found by mutation, not by reading.
   *
   * A site with `collect_page_paths` off (D7) nulls every path, so every event in
   * the visit shares one, and the pageview guard is then the ONLY thing standing
   * between a departure and the page row it would be re-filed under.
   *
   * MUTATION CHECK: delete either pageview check in orderTrail and this goes red
   * with the pageview hoisted above the departure — and the grouping assertion
   * below shows what that costs.
   */
  it('does not move a pageview, even on a site that collects no paths', () => {
    const trail = [
      ev('outbound_link', null, T(0), { url: 'https://x.test/', page_path: '/' }),
      ev('pageview', null, T(20), undefined, 4),
    ]
    expect(orderTrail(trail).map((e) => e.event_name)).toEqual(['outbound_link', 'pageview'])
    // The departure keeps its own row; it does NOT get filed under a page that
    // had not loaded when it happened.
    const groups = groupTrail(trail, ALL)
    expect(groups.map((g) => [g.page !== null, g.events.length])).toEqual([[false, 1], [true, 0]])
  })

  it('does not reorder a pageview that shares the page it is on', () => {
    const trail = [
      ev('outbound_link', '/a', T(0), { url: 'https://x.test/', page_path: '/a' }),
      ev('pageview', '/a', T(20), undefined, 3),
    ]
    expect(orderTrail(trail).map((e) => e.event_name)).toEqual(['outbound_link', 'pageview'])
  })

  it('does not reorder across two different pages', () => {
    const trail = [
      ev('outbound_link', '/a', T(0), { url: 'https://x.test/', page_path: '/a' }),
      ev('thing_on_b', '/b', T(20)),
    ]
    expect(orderTrail(trail).map((e) => e.event_name)).toEqual(['outbound_link', 'thing_on_b'])
  })

  it('does not reorder beyond the measured 250ms window', () => {
    const trail = [
      ev('outbound_link', '/a', T(0), { url: 'https://x.test/', page_path: '/a' }),
      ev('later_click', '/a', T(251)),
    ]
    expect(orderTrail(trail).map((e) => e.event_name)).toEqual(['outbound_link', 'later_click'])
    // 250 exactly is inside it
    const atTheEdge = [
      ev('outbound_link', '/a', T(0), { url: 'https://x.test/', page_path: '/a' }),
      ev('later_click', '/a', T(250)),
    ]
    expect(orderTrail(atTheEdge).map((e) => e.event_name)).toEqual(['later_click', 'outbound_link'])
  })

  /**
   * 🔴 A CLUSTER IS BOUNDED BY ITS FIRST MEMBER, not the previous one. Otherwise
   * three events 200ms apart chain into one 600ms "gesture" and the last gets
   * hoisted past the first — reordering events that are genuinely sequential.
   */
  /**
   * 🔴 THE CONSEQUENCE MUST BE FIRST IN THE FIXTURE. The first version of this
   * test put the outbound LAST, where bounding by the cluster's start and
   * bounding by the previous member produce the same answer — so the test passed
   * under both and proved nothing. Found by mutation.
   *
   * Here the departure leads. Bounded by the start, only the event 200ms in joins
   * it; the one at 400ms is a separate step and stays put. Chaining off the
   * previous member would swallow all three and hoist the departure past an event
   * 400ms away from it, which is no longer one gesture by any reading.
   *
   * MUTATION CHECK: bound the window off `events[j-1]` instead of `start` and
   * this goes red with ['click_two', 'click_three', 'outbound_link'].
   */
  it('does not let events chain into one long cluster', () => {
    const trail = [
      ev('outbound_link', '/a', T(0), { url: 'https://x.test/', page_path: '/a' }),
      ev('click_two', '/a', T(200)),
      ev('click_three', '/a', T(400)),
    ]
    expect(orderTrail(trail).map((e) => e.event_name)).toEqual(['click_two', 'outbound_link', 'click_three'])
  })

  it('keeps same-rank events in the order the server gave them', () => {
    const trail = [
      ev('b_event', '/a', T(0)),
      ev('a_event', '/a', T(10)),
      ev('c_event', '/a', T(20)),
    ]
    expect(orderTrail(trail).map((e) => e.event_name)).toEqual(['b_event', 'a_event', 'c_event'])
  })

  it('moves nothing when the timestamps will not parse', () => {
    // Fixtures using 't1'/'t2' must behave exactly as they did before round 7.
    const trail = [
      ev('outbound_link', '/a', 't1', { url: 'https://x.test/', page_path: '/a' }),
      ev('some_click', '/a', 't2'),
    ]
    expect(orderTrail(trail).map((e) => e.event_name)).toEqual(['outbound_link', 'some_click'])
  })

  it('is applied by groupTrail, so no caller can forget it', () => {
    const trail = [
      ev('pageview', '/pricing', T(0), undefined, 4),
      ev('outbound_link', '/pricing', T(541), { url: 'https://x.test/', page_path: '/pricing' }),
      ev('header_cta_get_started', '/pricing', T(580)),
    ]
    const groups = groupTrail(trail, ALL)
    expect(groups).toHaveLength(1)
    expect(groups[0].events.map((e) => e.event_name)).toEqual(['header_cta_get_started', 'outbound_link'])
  })
})
