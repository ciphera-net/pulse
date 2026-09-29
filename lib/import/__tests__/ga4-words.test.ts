// @vitest-environment node
//
// M5 (PULSE-140): the words GA4's flow adds to the import's error map, its
// callback codes, the ruled stop sentences (owner, 29-09-2026), the possessive
// fix (W-M5-19, constraint 5) and the quota pause time (W-M5-15).

import { describe, expect, it } from 'vitest'
import {
  ALL_ERROR_CODES,
  GA4_ERROR_CODES,
  GA4_CALLBACK_CODES,
  MAPPED_ERROR_CODES,
  ga4CallbackMessage,
  ga4StreamsDetails,
  importErrorMessage,
} from '../messages'
import { GA4_GUIDE, dailyVisitorsCaveat, possessive } from '../source-display'
import { hostsSummary, shareText, waitUntilText } from '@/components/settings/import/importFormat'

const FORBIDDEN = /[—–!]/

describe("GA4's error codes", () => {
  it('has a sentence for every code the GA4 routes answer, and the tables agree with the code lists', () => {
    for (const code of GA4_ERROR_CODES) {
      expect(MAPPED_ERROR_CODES, code).toContain(code)
      expect(ALL_ERROR_CODES, code).toContain(code)
      const m = importErrorMessage({ code }, 'ga4')
      expect(m?.text.length, code).toBeGreaterThan(10)
      expect(m!.text, code).not.toMatch(FORBIDDEN)
      expect(m!.text, code).not.toMatch(/\{|\}|undefined|null|ga4\b/)
    }
  })

  it("says the owner's two stop sentences, with the site's domain", () => {
    expect(importErrorMessage({ code: 'no_matching_property', detail: { domain: 'id.ciphera.net' } }, 'ga4')?.text).toBe(
      "None of this Google account's Google Analytics properties measures id.ciphera.net. Use another account, or add id.ciphera.net as a web stream in Google Analytics.",
    )
    expect(importErrorMessage({ code: 'several_matching_properties', detail: { domain: 'id.ciphera.net' } }, 'ga4')?.text).toBe(
      "More than one Google Analytics property measures id.ciphera.net, so Pulse can't tell which to import. Remove the extra web stream in Google Analytics, or use an account that can read only one.",
    )
  })

  it("writes the owner's details line from the server's web-stream hosts", () => {
    expect(ga4StreamsDetails('no_matching_property', 'Web data streams found: blog.other.example, shop.example')).toBe(
      'Web streams found: blog.other.example, shop.example.',
    )
    // A detail in another shape is shown as the server wrote it, never dropped.
    expect(ga4StreamsDetails('no_matching_property', 'No web data streams were found.')).toBe('No web data streams were found.')
    expect(ga4StreamsDetails('several_matching_properties', '2 properties have a web data stream for a.example')).toBe(
      '2 properties have a web data stream for a.example',
    )
    expect(ga4StreamsDetails('no_matching_property', undefined)).toBeNull()
  })

  it('names Google Analytics, not Matomo, for a property this account cannot read and for an empty range', () => {
    expect(importErrorMessage({ code: 'property_not_found' }, 'ga4')?.text).toMatch(/Google account/)
    expect(importErrorMessage({ code: 'property_not_found' }, 'matomo')?.text).toMatch(/Matomo site/)
    expect(importErrorMessage({ code: 'no_data_in_range' }, 'ga4')?.text).toBe(
      'Google Analytics has no data for this property on the days Pulse can import.',
    )
    expect(importErrorMessage({ code: 'no_data_in_range' }, 'plausible')?.text).toBe("There's nothing to import in this file.")
  })
})

describe("GA4's callback codes (the popup's landing page)", () => {
  it('says nothing for a connection that worked: the tab revalidates instead', () => {
    expect(ga4CallbackMessage('connected')).toBeNull()
    expect(ga4CallbackMessage('reconnected')).toBeNull()
  })

  it('has a sentence for every other code the callback redirects with', () => {
    for (const code of GA4_CALLBACK_CODES.filter((c) => c !== 'connected' && c !== 'reconnected')) {
      const m = ga4CallbackMessage(code)
      expect(m?.text.length, code).toBeGreaterThan(10)
      expect(m!.text, code).not.toMatch(FORBIDDEN)
      expect(m!.text, code).not.toMatch(/Something unexpected/)
    }
  })

  it('reuses the ruled sentences where they exist', () => {
    expect(ga4CallbackMessage('denied')?.text).toBe('Google sign-in was cancelled, so nothing was connected.')
    expect(ga4CallbackMessage('no_refresh_token')?.text).toBe(
      "Google didn't give Pulse lasting access. Connect again and allow access when Google asks.",
    )
    expect(ga4CallbackMessage('import_exists')?.text).toBe('This site already has an import. Delete it to start another.')
  })

  it('never shows a code it does not know raw', () => {
    expect(ga4CallbackMessage('brand_new')).toEqual({
      text: 'Something unexpected came back from Pulse. Nothing more was saved. Try again.',
      details: 'brand_new',
    })
    expect(ga4CallbackMessage('__proto__')?.details).toBe('__proto__')
  })
})

describe('the visitors caveat possessive (W-M5-19)', () => {
  it("writes a bare apostrophe after a name ending in s, and 's otherwise", () => {
    expect(possessive('Google Analytics')).toBe("Google Analytics'")
    expect(possessive('Matomo')).toBe("Matomo's")
    expect(dailyVisitorsCaveat('Google Analytics')).toBe(
      "Visitors are Google Analytics' daily counts added up, so over a range someone who came on three days counts three times.",
    )
    expect(dailyVisitorsCaveat('Matomo')).toMatch(/^Visitors are Matomo's daily counts/)
  })
})

describe("GA4's guide (W-M5 A lines)", () => {
  it('carries the ruled lines verbatim', () => {
    expect(GA4_GUIDE.connectNote).toBe('Google opens in a new window. Pulse only asks to read your Google Analytics.')
    expect(GA4_GUIDE.notImported).toEqual([
      "Exit pages: Google Analytics doesn't report them",
      "Visitor timezones, funnels and journeys: they can't be rebuilt from Google Analytics' reports",
    ])
    expect(GA4_GUIDE.worthKnowing).toEqual([
      'In-app browsers, such as Instagram or TikTok, show as Safari or Chrome on imported days, because Google Analytics reports the browser underneath them.',
      "Google Analytics leaves out some small counts when Google signals is on. Pulse imports what Google reports and doesn't estimate the rest.",
    ])
    for (const line of [...GA4_GUIDE.imported, ...GA4_GUIDE.notImported, ...GA4_GUIDE.worthKnowing]) expect(line).not.toMatch(FORBIDDEN)
  })
})

describe('the quota pause time (W-M5-15)', () => {
  const now = new Date('2026-09-29T10:20:00Z')
  it('says the time alone when it is today, in the zone given', () => {
    expect(waitUntilText('2026-09-29T12:00:00Z', now, 'Europe/Brussels')).toBe('14:00')
    expect(waitUntilText('2026-09-29T12:00:00Z', now, 'UTC')).toBe('12:00')
  })

  it('says "tomorrow at" when it is the next calendar day in that zone', () => {
    // Pacific midnight, the daily quota's reset: 07:00Z is 09:00 in Brussels the next day.
    expect(waitUntilText('2026-09-30T07:00:00Z', now, 'Europe/Brussels')).toBe('tomorrow at 09:00')
    // The same instant is still today in Los Angeles (00:00 the 30th is tomorrow there too).
    expect(waitUntilText('2026-09-30T07:00:00Z', now, 'America/Los_Angeles')).toBe('tomorrow at 00:00')
    // Near midnight: 23:30 in Kiritimati (UTC+14) is already the next day there.
    expect(waitUntilText('2026-09-29T10:30:00Z', new Date('2026-09-29T09:00:00Z'), 'Pacific/Kiritimati')).toBe('tomorrow at 00:30')
  })

  it('says a full date further out, and nothing for a value it cannot read', () => {
    expect(waitUntilText('2026-10-02T07:00:00Z', now, 'UTC')).toBe('02/10/2026 07:00')
    expect(waitUntilText('not a time', now, 'UTC')).toBeNull()
    expect(waitUntilText(null, now, 'UTC')).toBeNull()
  })
})

describe('hostname words (W-M5-9, W-M5-11)', () => {
  it('writes a share as a percent with one decimal, never a trailing .0', () => {
    expect(shareText(0.916)).toBe('91.6%')
    expect(shareText(0.005)).toBe('0.5%')
    expect(shareText(1)).toBe('100%')
    expect(shareText(0)).toBe('0%')
  })

  it('names the kept hostnames and their share', () => {
    expect(
      hostsSummary([
        { host: 'id.ciphera.net', share: 0.916 },
        { host: 'www.id.ciphera.net', share: 0.077 },
      ]),
    ).toBe('id.ciphera.net and www.id.ciphera.net, 99.3% of pageviews')
    expect(hostsSummary([{ host: 'a.example', share: 1 }])).toBe('a.example, 100% of pageviews')
    expect(hostsSummary([{ host: 'a', share: 0.2 }, { host: 'b', share: 0.2 }, { host: 'c', share: 0.2 }])).toBe(
      'a, b and c, 60% of pageviews',
    )
  })
})
