import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { Buildings, Globe, MapPin } from '@phosphor-icons/react'
import { getFilterValueIcon, getReferrerIcon } from '@/lib/utils/icons'
import { getChannelIcon } from '@/components/dashboard/channelIcon'
import { languageFlagCode } from '@/lib/dashboard/placeFlags'
import { placeCountriesFrom } from '@/components/dashboard/filter/search/values'
import type { DashboardData } from '@/lib/api/stats'

// ---------------------------------------------------------------------------
// The Filter menu draws every value as the dashboard's blocks draw it (16-11-2026, the owner: the menu's favicons
// were broken images, and cities, regions, channels, languages and timezones had no picture of their own).
// ---------------------------------------------------------------------------

const draw = (node: React.ReactNode) => render(<span>{node}</span>).container.firstElementChild as HTMLElement
/** The markup a block draws for the same value, to compare with. */
const markup = (node: React.ReactNode) => render(<span>{node}</span>).container.firstElementChild!.innerHTML
const flagOf = (el: HTMLElement) => el.querySelector('img')?.getAttribute('src')?.match(/\/flags\/([a-z]+)\.svg$/)?.[1] ?? null

describe('a referrer: its favicon, or the house icon or the globe, never a broken image', () => {
  it('draws the favicon while it loads and once it is a real icon', () => {
    const el = draw(getFilterValueIcon('referrer', 'example.org'))
    const img = el.querySelector('img') as HTMLImageElement
    expect(img.getAttribute('src')).toContain('domain=example.org')
    Object.defineProperty(img, 'naturalWidth', { value: 32 })
    fireEvent.load(img)
    expect(el.querySelector('img[data-favicon]')).toBeTruthy()
  })

  it('draws the globe when the favicon fails to load', () => {
    const el = draw(getFilterValueIcon('referrer', 'no-icon.example'))
    fireEvent.error(el.querySelector('img') as HTMLImageElement)
    expect(el.querySelector('img')).toBeNull()
    expect(el.innerHTML).toBe(markup(getReferrerIcon('no-icon.example')))
  })

  it('draws the globe when the proxy answers its 16 px stand-in for "no icon"', () => {
    const el = draw(getFilterValueIcon('referrer', 'tiny.example'))
    const img = el.querySelector('img') as HTMLImageElement
    Object.defineProperty(img, 'naturalWidth', { value: 16 })
    fireEvent.load(img)
    expect(el.querySelector('img')).toBeNull()
    expect(el.innerHTML).toBe(markup(<Globe className="w-5 h-5 text-neutral-400" />))
  })
})

describe('the place kinds draw a flag, as the Locations block does', () => {
  it('a city and a region draw their country\'s flag', () => {
    expect(flagOf(draw(getFilterValueIcon('city', 'Oslo', 'NO')))).toBe('no')
    expect(flagOf(draw(getFilterValueIcon('region', 'Viken', 'NO')))).toBe('no')
  })

  it('without a known country they keep the kind\'s mark (the funnel breakdown has none)', () => {
    expect(draw(getFilterValueIcon('city', 'Oslo')).innerHTML).toBe(markup(<Buildings className="text-neutral-500" />))
    expect(draw(getFilterValueIcon('region', 'Viken')).innerHTML).toBe(markup(<MapPin className="text-neutral-500" />))
  })

  it('a language draws its tag\'s region, else its likely region, else the globe', () => {
    expect(flagOf(draw(getFilterValueIcon('language', 'en-GB')))).toBe('gb')
    expect(flagOf(draw(getFilterValueIcon('language', 'nb')))).toBe('no')
    expect(flagOf(draw(getFilterValueIcon('language', 'zh-Hant-TW')))).toBe('tw')
    expect(languageFlagCode('Unknown')).toBe('')
    expect(draw(getFilterValueIcon('language', 'Unknown')).querySelector('img')).toBeNull()
  })

  it('a timezone draws its zone\'s country, and a zone of no country the globe', () => {
    expect(flagOf(draw(getFilterValueIcon('timezone', 'Europe/Oslo')))).toBe('no')
    expect(flagOf(draw(getFilterValueIcon('timezone', 'America/New_York')))).toBe('us')
    const utc = draw(getFilterValueIcon('timezone', 'UTC'))
    expect(utc.querySelector('img')).toBeNull()
    expect(utc.querySelector('svg')).toBeTruthy()
  })
})

describe('a channel draws its Sources mark', () => {
  it.each(['Organic Search', 'Direct', 'Email', 'Paid Social', 'Something new'])('%s', (channel) => {
    expect(draw(getFilterValueIcon('channel', channel)).innerHTML).toBe(markup(getChannelIcon(channel)))
  })
})

describe('placeCountriesFrom: a pill\'s city or region finds its country in the page\'s own lists', () => {
  it('indexes cities and regions by name; the first (busiest) row wins; a row with no country is left out', () => {
    const dashboard = {
      cities: [
        { city: 'Portland', country: 'US', pageviews: 9, visitors: 9 },
        { city: 'Portland', country: 'AU', pageviews: 1, visitors: 1 },
        { city: 'Oslo', country: 'NO', pageviews: 5, visitors: 5 },
        { city: 'Nowhere', country: '', pageviews: 1, visitors: 1 },
      ],
      regions: [{ region: 'Viken', country: 'NO', pageviews: 3, visitors: 3 }],
    } as unknown as DashboardData
    expect(placeCountriesFrom(dashboard)).toEqual({ city: { Portland: 'US', Oslo: 'NO' }, region: { Viken: 'NO' } })
    expect(placeCountriesFrom(null)).toEqual({})
  })
})

describe('the event filter kinds (R45): an event its mark, an outbound link its destination\'s favicon', () => {
  it('draws an outbound link as the Outbound tab draws its row: the favicon of the link\'s host, www. dropped', async () => {
    const { OUTBOUND_KIND, eventPropertyKind } = await import('@/lib/filters')
    const el = draw(getFilterValueIcon(OUTBOUND_KIND, 'https://www.example.org/docs?tab=api'))
    expect(el.querySelector('img')?.getAttribute('src')).toContain('domain=example.org')
    // A site the house draws itself: the same artwork its referrer row draws.
    expect(draw(getFilterValueIcon(OUTBOUND_KIND, 'https://github.com/ciphera')).innerHTML).toBe(markup(getFilterValueIcon('referrer', 'github.com')))
    // No web address: the globe, never a request for a favicon.
    const none = draw(getFilterValueIcon(OUTBOUND_KIND, 'javascript:alert(1)'))
    expect(none.querySelector('img')).toBeNull()
    // Any other property, and the bare kind: the event's mark (an svg, no image).
    for (const d of ['event', eventPropertyKind('signup', 'plan')]) {
      const mark = draw(getFilterValueIcon(d, 'pro'))
      expect(mark.querySelector('img')).toBeNull()
      expect(mark.querySelector('svg')).toBeTruthy()
    }
  })
})

describe('an event property\'s value: a link draws its destination, anything else the event\'s mark (R45)', () => {
  it('draws a link value\'s favicon, as the Events block draws its link values', async () => {
    const { eventPropertyKind } = await import('@/lib/filters')
    const el = draw(getFilterValueIcon(eventPropertyKind('file_download', 'url'), 'https://www.example.org/a.pdf'))
    expect(el.querySelector('img')?.getAttribute('src')).toContain('domain=example.org')
  })

  it('draws the event\'s mark for a value that is no link, and never a globe', async () => {
    const { eventPropertyKind, OUTBOUND_KIND } = await import('@/lib/filters')
    const plain = draw(getFilterValueIcon(eventPropertyKind('signup', 'plan'), 'pro'))
    expect(plain.querySelector('img')).toBeNull()
    expect(plain.innerHTML).not.toBe(markup(<Globe className="text-neutral-500" />))
    // An outbound link that opens no page keeps the globe it had.
    expect(markup(getFilterValueIcon(OUTBOUND_KIND, 'javascript:void(0)'))).toBe(markup(<Globe className="text-neutral-500" />))
  })
})
