// @vitest-environment jsdom
//
// Reports (PULSE-133) and scheduled report emails (PULSE-134): the contract's
// routes, byte for byte. Member routes carry the session; the public read maps
// 401 to "password required" and 404 to "not found" and throws everything else
// (a network failure is not "this report does not exist"); the print key rides
// the public read as `pk`; the public PDF never tries a session refresh.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setAccessToken, setRefreshHandler, ApiError } from '@/lib/api/client'
import {
  createReport,
  createSchedule,
  deleteReport,
  downloadPublicReportPdf,
  getPublicReport,
  listReports,
  listSchedules,
  reportPdfFilename,
  serverMessage,
  stopSchedule,
  unlockPublicReport,
  type CreateReportRequest,
} from '@/lib/api/reports'

function fakeResponse({ status = 200, headers = {}, body = null as unknown }: { status?: number; headers?: Record<string, string>; body?: unknown } = {}) {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]))
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => lower[name.toLowerCase()] ?? null },
    blob: async () => new Blob(['%PDF'], { type: 'application/pdf' }),
    json: async () => body ?? {},
  } as unknown as Response
}

const call = (fetchMock: ReturnType<typeof vi.fn>, i = 0) => fetchMock.mock.calls[i] as unknown as [string, RequestInit]

const REQUEST: CreateReportRequest = {
  name: 'Investor update, September 2026',
  period: { preset: 'last_90_days' },
  compare: 'previous',
  sections: ['headline', 'growth'],
  pdf_theme: 'light',
  password: null,
  expires_in_days: 30,
}

beforeEach(() => {
  setAccessToken('tok-abc')
  setRefreshHandler(null)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  setAccessToken(null)
})

describe('member routes', () => {
  it('POSTs a report as JSON with the session, and returns the report and its link', async () => {
    const body = { report: { id: 'r1' }, url: 'https://pulse.ciphera.net/r/abc' }
    const fetchMock = vi.fn(async () => fakeResponse({ status: 201, body }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(createReport('site-1', REQUEST)).resolves.toEqual(body)
    const [url, init] = call(fetchMock)
    expect(url).toMatch(/\/api\/v1\/sites\/site-1\/reports$/)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual(REQUEST)
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer tok-abc')
  })

  it('lists reports and schedules, reading a null list as empty', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      fakeResponse({ body: url.includes('report-schedules') ? { schedules: null } : { reports: [{ id: 'r1' }] } })))
    await expect(listReports('site-1')).resolves.toEqual([{ id: 'r1' }])
    await expect(listSchedules('site-1')).resolves.toEqual([])
  })

  it('DELETEs a report and a schedule by id', async () => {
    const fetchMock = vi.fn(async () => fakeResponse({ status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
    await deleteReport('site-1', 'r1')
    await stopSchedule('site-1', 's1')
    expect(call(fetchMock, 0)[0]).toMatch(/\/api\/v1\/sites\/site-1\/reports\/r1$/)
    expect(call(fetchMock, 0)[1].method).toBe('DELETE')
    expect(call(fetchMock, 1)[0]).toMatch(/\/api\/v1\/sites\/site-1\/report-schedules\/s1$/)
    expect(call(fetchMock, 1)[1].method).toBe('DELETE')
  })

  it('POSTs a schedule and returns it', async () => {
    const fetchMock = vi.fn(async () => fakeResponse({ status: 201, body: { schedule: { id: 's1' } } }))
    vi.stubGlobal('fetch', fetchMock)
    const req = {
      name: 'Monthly update',
      every: 'month' as const,
      compare: 'previous' as const,
      sections: ['headline' as const],
      pdf_theme: 'dark' as const,
      expires_in_days: 90 as const,
      recipient_user_ids: ['me'],
    }
    await expect(createSchedule('site-1', req)).resolves.toEqual({ id: 's1' })
    expect(call(fetchMock)[0]).toMatch(/\/api\/v1\/sites\/site-1\/report-schedules$/)
    expect(JSON.parse(call(fetchMock)[1].body as string)).toEqual(req)
  })
})

describe('public routes', () => {
  it('reads a report anonymously by its token, and puts the print key in `pk`', async () => {
    const body = { report: { version: 1 }, name: 'Q3', pdf_theme: 'dark' }
    const fetchMock = vi.fn(async () => fakeResponse({ body }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(getPublicReport('a/b c')).resolves.toEqual({ status: 'ok', report: { version: 1 }, name: 'Q3', pdf_theme: 'dark' })
    expect(call(fetchMock)[0]).toMatch(/\/api\/v1\/public\/reports\/a%2Fb%20c$/)
    await getPublicReport('tok', 'v1.1767225600.a+b/c=')
    expect(call(fetchMock, 1)[0]).toMatch(/\/api\/v1\/public\/reports\/tok\?pk=v1\.1767225600\.a%2Bb%2Fc%3D$/)
  })

  it('maps 401 to the password form and 404 to not found, and never refreshes a session for either', async () => {
    const refresh = vi.fn()
    setRefreshHandler(refresh)
    vi.stubGlobal('fetch', vi.fn(async () => fakeResponse({ status: 401, body: { error: 'password_required' } })))
    await expect(getPublicReport('tok')).resolves.toEqual({ status: 'password_required' })
    vi.stubGlobal('fetch', vi.fn(async () => fakeResponse({ status: 404 })))
    await expect(getPublicReport('tok')).resolves.toEqual({ status: 'not_found' })
    expect(refresh).not.toHaveBeenCalled()
  })

  it('throws anything else: a 500 is not "not found"', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => fakeResponse({ status: 500 })))
    await expect(getPublicReport('tok')).rejects.toBeInstanceOf(ApiError)
  })

  it('unlocks with the password: 204 is true, 401 is false', async () => {
    const fetchMock = vi.fn(async () => fakeResponse({ status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(unlockPublicReport('tok', 'hunter2')).resolves.toBe(true)
    expect(call(fetchMock)[0]).toMatch(/\/api\/v1\/public\/reports\/tok\/unlock$/)
    expect(call(fetchMock)[1].method).toBe('POST')
    expect(JSON.parse(call(fetchMock)[1].body as string)).toEqual({ password: 'hunter2' })
    // The cookie it sets must come back on the next read.
    expect(call(fetchMock)[1].credentials).toBe('include')

    vi.stubGlobal('fetch', vi.fn(async () => fakeResponse({ status: 401 })))
    await expect(unlockPublicReport('tok', 'wrong')).resolves.toBe(false)
  })

  it('saves the public PDF under the name the server gives it, or the report name', async () => {
    let clicked: string | null = null
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      if (tag !== 'a') return Object.getPrototypeOf(document).createElement.call(document, tag)
      const a = { href: '', download: '', click: () => { clicked = a.download } }
      return a as unknown as HTMLElement
    }) as typeof document.createElement)
    const fetchMock = vi.fn(async () => fakeResponse())
    vi.stubGlobal('fetch', fetchMock)
    await downloadPublicReportPdf('tok', 'Investor update, September 2026')
    expect(call(fetchMock)[0]).toMatch(/\/api\/v1\/public\/reports\/tok\/pdf$/)
    expect(clicked).toBe('investor-update-september-2026.pdf')
  })
})

describe('helpers', () => {
  it('turns a report name into a file name', () => {
    expect(reportPdfFilename('Investor update, September 2026')).toBe('investor-update-september-2026.pdf')
    expect(reportPdfFilename('Één — Überblick')).toBe('een-uberblick.pdf')
    expect(reportPdfFilename('!!!')).toBe('pulse-report.pdf')
  })

  it("prefers the server's own words to the fallback", () => {
    expect(serverMessage(new ApiError('Forbidden', 403, { error: 'Not a member of this team.' }), 'x')).toBe('Not a member of this team.')
    expect(serverMessage(new ApiError('Forbidden', 403, {}), 'x')).toBe('x')
    expect(serverMessage(new Error('boom'), 'x')).toBe('x')
  })
})
