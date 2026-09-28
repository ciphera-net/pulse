// @vitest-environment jsdom
//
// Settings → Export's request (PULSE-132, design §9.2). The route is a GET whose
// configuration IS the query string, so these pin the query byte for byte: the
// closed vocabularies in the server's order, the range as either the `all` token
// or two site-local days (never both, never All time as dates), the grain only
// with the daily summary, and the dashboard's own filter DSL. The download goes
// through apiRequestBlob, so it carries the session and surfaces the server's
// error message rather than saving an error body as a file.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setAccessToken, setRefreshHandler } from '@/lib/api/client'
import { buildExportQuery, downloadExport, type ExportRequest } from '@/lib/api/export'

const BASE: ExportRequest = {
  tables: ['daily', 'pages'],
  metrics: ['visitors', 'pageviews'],
  grain: 'day',
  range: { from: '2026-08-30', to: '2026-09-28' },
  filters: [],
  limit: 'all',
  format: 'xlsx',
}

const params = (req: ExportRequest) => new URLSearchParams(buildExportQuery(req))

describe('buildExportQuery', () => {
  it('writes every parameter the route takes, and nothing else', () => {
    expect(buildExportQuery(BASE)).toBe(
      'tables=daily%2Cpages&metrics=visitors%2Cpageviews&grain=day&from=2026-08-30&to=2026-09-28&limit=all&format=xlsx',
    )
  })

  it("lists tables and metrics in the server's order, whatever order they were ticked in", () => {
    const q = params({
      ...BASE,
      tables: ['events', 'utm_campaign', 'daily', 'goals', 'referrers'],
      metrics: ['scroll_depth', 'visitors', 'bounce_rate'],
    })
    expect(q.get('tables')).toBe('daily,referrers,utm_campaign,goals,events')
    expect(q.get('metrics')).toBe('visitors,bounce_rate,scroll_depth')
  })

  it('sends All time as the token and never as dates (it is exempt from the 366-day cap)', () => {
    const q = params({ ...BASE, range: { period: 'all' } })
    expect(q.get('period')).toBe('all')
    expect(q.has('from')).toBe(false)
    expect(q.has('to')).toBe(false)
  })

  it('sends any other range as two site-local days and no period', () => {
    const q = params(BASE)
    expect(q.get('from')).toBe('2026-08-30')
    expect(q.get('to')).toBe('2026-09-28')
    expect(q.has('period')).toBe(false)
  })

  it('sends a grain only with the daily summary, the one table that has one', () => {
    expect(params({ ...BASE, grain: 'week' }).get('grain')).toBe('week')
    expect(params({ ...BASE, tables: ['pages', 'countries'], grain: 'week' }).has('grain')).toBe(false)
  })

  it("serialises filters with the dashboard's v2 DSL, escaping the delimiters inside a value", () => {
    const q = params({
      ...BASE,
      filters: [
        { dimension: 'country', operator: 'is', values: ['DE'] },
        { dimension: 'page', operator: 'contains', values: ['/a,b'] },
      ],
    })
    expect(q.get('filters')).toBe('v2:country|is|DE,page|contains|/a%2Cb')
  })

  it('leaves filters out entirely when there are none', () => {
    expect(params(BASE).has('filters')).toBe(false)
  })

  it('passes the row limit and the format through', () => {
    const q = params({ ...BASE, limit: '1000', format: 'csv' })
    expect(q.get('limit')).toBe('1000')
    expect(q.get('format')).toBe('csv')
  })
})

// A fake response, not `new Response(blob)`: see invoice-pdf-download.test.ts for why.
function fakeResponse({ status = 200, headers = {}, body = null as unknown }: { status?: number; headers?: Record<string, string>; body?: unknown } = {}) {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]))
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => lower[name.toLowerCase()] ?? null },
    blob: async () => new Blob(['PK'], { type: 'application/zip' }),
    json: async () => body ?? {},
  } as unknown as Response
}

let clicked: { href: string; download: string } | null = null

describe('downloadExport', () => {
  beforeEach(() => {
    clicked = null
    setAccessToken('tok-abc')
    setRefreshHandler(null)
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      if (tag !== 'a') return Object.getPrototypeOf(document).createElement.call(document, tag)
      const a = { href: '', download: '', click: () => { clicked = { href: a.href, download: a.download } } }
      return a as unknown as HTMLElement
    }) as typeof document.createElement)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    setAccessToken(null)
  })

  it("GETs the site's export route with the built query, carrying the session", async () => {
    const fetchMock = vi.fn(async () => fakeResponse())
    vi.stubGlobal('fetch', fetchMock)

    await downloadExport('site-1', BASE)

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toMatch(/\/api\/v1\/sites\/site-1\/export\?/)
    expect(url.split('?')[1]).toBe(buildExportQuery(BASE))
    expect(init.method ?? 'GET').toBe('GET')
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer tok-abc')
  })

  it('saves the file under the name the server gives it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      fakeResponse({ headers: { 'Content-Disposition': 'attachment; filename="pulse_ciphera.net_2026-09-28.xlsx"' } })))

    await downloadExport('site-1', BASE)

    expect(clicked).toEqual({ href: 'blob:fake', download: 'pulse_ciphera.net_2026-09-28.xlsx' })
  })

  it('falls back to a name with the right extension when the header does not reach the browser', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => fakeResponse()))
    await downloadExport('site-1', { ...BASE, format: 'csv' })
    expect(clicked?.download).toBe('pulse-export.zip')
  })

  it("throws the server's message and saves nothing when the export fails", async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      fakeResponse({ status: 400, body: { error: 'Other tables cover up to a year at a time.' } })))

    await expect(downloadExport('site-1', BASE)).rejects.toMatchObject({
      status: 400,
      message: 'Other tables cover up to a year at a time.',
    })
    expect(clicked).toBeNull()
  })
})
