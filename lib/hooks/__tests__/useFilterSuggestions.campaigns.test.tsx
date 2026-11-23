import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { SiteScopeProvider, memberScope } from '@/lib/scope/SiteScope'
import { markTeamResolved, setAccessToken, setActiveTeam } from '@/lib/api/client'
import { CAMPAIGNS_SHARED_MS, useFilterSuggestions } from '../useFilterSuggestions'

// PUL-94: utm_source, utm_medium and utm_campaign are three fields of one list (the campaigns breakdown), and the
// Filter button reads every kind in one pass, so they were three identical reads, each a ClickHouse query on the
// dashboard's shared limit. One read now serves the three for CAMPAIGNS_SHARED_MS; a failed read is not shared.

vi.mock('@ciphera-net/facet', () => ({
  authMessageFromStatus: (status: number) => `Error ${status}`,
  AUTH_ERROR_MESSAGES: { NETWORK: 'Network error, please try again.' },
}))
vi.mock('@/lib/utils/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }))

const ROWS = [
  { source: 'google', medium: 'cpc', campaign: 'dec26', term: '', content: '', visitors: 3, pageviews: 5, bounce_rate: null },
  { source: 'newsletter', medium: 'email', campaign: 'dec26', term: '', content: '', visitors: 2, pageviews: 2, bounce_rate: null },
]

let fetchSpy: ReturnType<typeof vi.fn>
let failing = false
let seq = 0
const campaignReads = () => fetchSpy.mock.calls.filter(([url]) => String(url).includes('/campaigns')).length

beforeEach(() => {
  failing = false
  fetchSpy = vi.fn().mockImplementation(async () =>
    failing
      ? new Response(JSON.stringify({ error: 'down' }), { status: 400, headers: { 'content-type': 'application/json' } })
      : new Response(JSON.stringify({ campaigns: ROWS }), { status: 200, headers: { 'content-type': 'application/json' } }),
  )
  vi.stubGlobal('fetch', fetchSpy)
  markTeamResolved()
  setAccessToken('member-token')
  setActiveTeam('team-1')
})

afterEach(() => {
  setAccessToken(null)
  setActiveTeam(null)
  vi.unstubAllGlobals()
})

function suggestions() {
  const id = `campaigns-site-${++seq}`
  const wrapper = ({ children }: { children: React.ReactNode }) => <SiteScopeProvider scope={memberScope(id)}>{children}</SiteScopeProvider>
  return renderHook(() => useFilterSuggestions(id, { start: '2026-11-01', end: '2026-11-07' }), { wrapper }).result
}

describe('the three campaign kinds share one read (PUL-94)', () => {
  it('reads the campaigns list once for utm_source, utm_medium and utm_campaign asked together', async () => {
    const result = suggestions()
    const [source, medium, campaign] = await Promise.all(['utm_source', 'utm_medium', 'utm_campaign'].map((d) => result.current(d)))
    expect(campaignReads()).toBe(1)
    expect(source.map((s) => s.value).sort()).toEqual(['google', 'newsletter'])
    expect(medium.map((s) => s.value).sort()).toEqual(['cpc', 'email'])
    expect(campaign).toEqual([{ value: 'dec26', label: 'dec26', count: 7 }])
  })

  it('shares it one after the other within the window, and reads fresh after it', async () => {
    const result = suggestions()
    await result.current('utm_source')
    await result.current('utm_medium')
    expect(campaignReads()).toBe(1)
    const later = Date.now() + CAMPAIGNS_SHARED_MS + 1
    const clock = vi.spyOn(Date, 'now').mockReturnValue(later)
    try {
      await result.current('utm_campaign')
    } finally {
      clock.mockRestore()
    }
    expect(campaignReads()).toBe(2)
  })

  it('does not share a failed read: the next kind asks again', async () => {
    const result = suggestions()
    failing = true
    await expect(result.current('utm_source')).rejects.toBeTruthy()
    const afterFailure = campaignReads()
    failing = false
    await expect(result.current('utm_medium')).resolves.toHaveLength(2)
    expect(campaignReads()).toBe(afterFailure + 1)
  })
})
