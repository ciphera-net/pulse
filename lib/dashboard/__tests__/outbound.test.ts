import { describe, it, expect } from 'vitest'
import { outboundLinkRows } from '@/lib/dashboard/outbound'

// Outbound links as rows (the Pages block's Outbound tab in the new dashboard frame). What is pinned: a row reads
// as a person would say the link, it opens exactly what was recorded, and nothing that is not a web address
// becomes a link.

describe('outboundLinkRows', () => {
  it('reads a link as its host without www, then its path and query, with no scheme', () => {
    expect(outboundLinkRows([{ value: 'https://www.strava.com/clubs/haldencycles', count: 443 }])).toEqual([
      { href: 'https://www.strava.com/clubs/haldencycles', hrefs: ['https://www.strava.com/clubs/haldencycles'], host: 'strava.com', label: 'strava.com/clubs/haldencycles', clicks: 443 },
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

// A list never draws the same row twice (lib/dashboard/sameRows.ts). A link's row reads its host without `www.`,
// its path and its query, so recorded links that differ only in what the row does not show are ONE row.
describe('outboundLinkRows: links that read the same are one row', () => {
  it.each([
    ['the scheme', ['http://shop.example/cart', 'https://shop.example/cart']],
    ['www.', ['https://www.shop.example/cart', 'https://shop.example/cart']],
    ['the case of the host', ['https://Shop.Example/cart', 'https://shop.example/cart']],
    ['an anchor', ['https://shop.example/cart#top', 'https://shop.example/cart#pay', 'https://shop.example/cart']],
  ])('merges two links that differ only in %s', (_what, values) => {
    const rows = outboundLinkRows(values.map((value, i) => ({ value, count: 10 - i })))
    expect(rows).toHaveLength(1)
    expect(rows[0].label).toBe('shop.example/cart')
    expect(rows[0].clicks).toBe(values.reduce((sum, _v, i) => sum + 10 - i, 0))
  })

  it('opens its most clicked link and lists every link it stands for, most clicked first', () => {
    const [row] = outboundLinkRows([
      { value: 'http://shop.example/cart', count: 2 },
      { value: 'https://www.shop.example/cart', count: 9 },
      { value: 'https://shop.example/cart#pay', count: 5 },
    ])
    expect(row).toEqual({
      href: 'https://www.shop.example/cart',
      hrefs: ['https://www.shop.example/cart', 'https://shop.example/cart#pay', 'http://shop.example/cart'],
      host: 'shop.example',
      label: 'shop.example/cart',
      clicks: 16,
    })
  })

  it('keeps apart what reads apart: another path, another query, another host', () => {
    const rows = outboundLinkRows([
      { value: 'https://shop.example/cart', count: 4 },
      { value: 'https://shop.example/cart/', count: 3 },
      { value: 'https://shop.example/cart?step=2', count: 2 },
      { value: 'https://blog.shop.example/cart', count: 1 },
    ])
    expect(rows.map((r) => r.label)).toEqual(['shop.example/cart', 'shop.example/cart/', 'shop.example/cart?step=2', 'blog.shop.example/cart'])
  })

  it('ranks a merged row by its own clicks, and loses none', () => {
    const input = [
      { value: 'https://a.example/', count: 10 },
      { value: 'https://b.example/', count: 6 },
      { value: 'http://b.example/', count: 6 },
      { value: 'https://c.example/', count: 1 },
    ]
    const rows = outboundLinkRows(input)
    expect(rows.map((r) => [r.label, r.clicks])).toEqual([['b.example', 12], ['a.example', 10], ['c.example', 1]])
    expect(rows.reduce((sum, r) => sum + r.clicks, 0)).toBe(input.reduce((sum, v) => sum + v.count, 0))
  })

  it('never draws a label twice', () => {
    const values = ['https://x.com/a', 'http://x.com/a', 'https://www.x.com/a', 'https://X.com/a#b', 'https://x.com/b', 'https://x.com/a?c=1', 'https://x.com/a?c=1#z']
    const drawn = outboundLinkRows(values.map((value) => ({ value, count: 1 }))).map((r) => r.label)
    expect(drawn).toEqual(['x.com/a', 'x.com/a?c=1', 'x.com/b'])
  })
})
