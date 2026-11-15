import { describe, it, expect } from 'vitest'
import { outboundLinkRows } from '@/lib/dashboard/outbound'

// Outbound links as rows (the Pages block's Outbound tab in the new dashboard frame). What is pinned: a row reads
// as a person would say the link, it opens exactly what was recorded, and nothing that is not a web address
// becomes a link.

describe('outboundLinkRows', () => {
  it('reads a link as its host without www, then its path and query, with no scheme', () => {
    expect(outboundLinkRows([{ value: 'https://www.strava.com/clubs/haldencycles', count: 443 }])).toEqual([
      { href: 'https://www.strava.com/clubs/haldencycles', host: 'strava.com', label: 'strava.com/clubs/haldencycles', clicks: 443 },
    ])
    expect(outboundLinkRows([{ value: 'http://Shop.Example.com/a/b?size=m&c=2', count: 3 }])[0]).toMatchObject({
      host: 'shop.example.com',
      label: 'shop.example.com/a/b?size=m&c=2',
    })
  })

  it('writes nothing after the host for a bare slash, and keeps a query on one', () => {
    expect(outboundLinkRows([{ value: 'https://komoot.com/', count: 1 }])[0].label).toBe('komoot.com')
    expect(outboundLinkRows([{ value: 'https://komoot.com', count: 1 }])[0].label).toBe('komoot.com')
    expect(outboundLinkRows([{ value: 'https://komoot.com/?ref=halden', count: 1 }])[0].label).toBe('komoot.com/?ref=halden')
  })

  it('keeps a trailing slash and the fragment out of nothing it was not asked to: the label is the address as recorded', () => {
    // A trailing slash is part of the path a site chose; it is shown.
    expect(outboundLinkRows([{ value: 'https://instagram.com/haldencycles/', count: 335 }])[0].label).toBe('instagram.com/haldencycles/')
  })

  it('opens exactly what was recorded: the href is the value, www and all', () => {
    const [row] = outboundLinkRows([{ value: 'https://www.youtube.com/@haldencycles', count: 176 }])
    expect(row.href).toBe('https://www.youtube.com/@haldencycles')
    expect(row.host).toBe('youtube.com')
  })

  it('keeps the read\'s order and its counts as clicks', () => {
    const rows = outboundLinkRows([
      { value: 'https://a.example/', count: 9 },
      { value: 'https://b.example/x', count: 4 },
      { value: 'https://a.example/y', count: 2 },
    ])
    expect(rows.map((r) => [r.label, r.clicks])).toEqual([['a.example', 9], ['b.example/x', 4], ['a.example/y', 2]])
  })

  it('leaves out a value that is not an address', () => {
    expect(outboundLinkRows([{ value: 'not a url', count: 5 }, { value: '', count: 1 }, { value: '/relative/path', count: 2 }])).toEqual([])
  })

  it.each([
    ['javascript:alert(1)'],
    ['data:text/html,<script>alert(1)</script>'],
    ['mailto:someone@example.com'],
    ['tel:+3200000000'],
    ['ftp://files.example.com/a'],
    ['blob:https://example.com/1'],
  ])('never turns %s into a link: only http and https open a page', (value) => {
    expect(outboundLinkRows([{ value, count: 7 }])).toEqual([])
  })

  it('answers no rows for no read', () => {
    expect(outboundLinkRows(undefined)).toEqual([])
    expect(outboundLinkRows(null)).toEqual([])
    expect(outboundLinkRows([])).toEqual([])
  })
})
