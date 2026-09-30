import { describe, it, expect, vi, beforeEach } from 'vitest'

// PULSE-173 (F1): getLanguageGroups hits the SAME `/languages` route as
// getLanguages, but with `?group=language` the backend switches its response
// envelope — GetLanguagesHandler answers `{ language_groups: [...], imported:
// ... }`, never the plain `{ languages: [...] }` shape the ungrouped call
// returns (internal/api/stats.go). Reading the wrong key silently returns []
// on every real response — no error, no type failure, just an empty "view
// all" list — so this pins the envelope key against a mocked HTTP body rather
// than trusting the type import to catch a wire mismatch.

vi.mock('@ciphera-net/facet', () => ({
  authMessageFromStatus: (status: number) => `Error ${status}`,
  AUTH_ERROR_MESSAGES: { NETWORK: 'Network error, please try again.' },
}))

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
}

const { getLanguageGroups } = await import('../stats')

describe('getLanguageGroups envelope (PULSE-173)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('reads rows from `language_groups`, the grouped envelope the backend actually sends', async () => {
    const rows = [
      { language: 'en', pageviews: 283, visitors: 144, bounce_rate: null, avg_duration: null, members: ['en-US', 'en-GB', 'en'], locale_count: 3, flag_region: 'US' },
    ]
    const fetchSpy = vi.fn().mockResolvedValue(jsonResponse({ language_groups: rows, imported: null }))
    vi.stubGlobal('fetch', fetchSpy)

    const result = await getLanguageGroups('site-1', '2026-07-20', '2026-08-18')

    expect(result).toEqual(rows)
    const [url] = fetchSpy.mock.calls.at(-1) as [string, RequestInit]
    expect(url).toContain('/sites/site-1/languages')
    expect(url).toContain('group=language')
  })

  it('does NOT read a sibling `languages` key on the same body — that is a different endpoint\'s shape', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(jsonResponse({
      languages: [{ language: 'en-US', pageviews: 189, visitors: 110 }],
      language_groups: [],
      imported: null,
    }))
    vi.stubGlobal('fetch', fetchSpy)

    const result = await getLanguageGroups('site-1')

    expect(result).toEqual([])
  })

  it('returns [] rather than throwing when the grouped key is absent (older/unexpected body)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ imported: null })))

    const result = await getLanguageGroups('site-1')

    expect(result).toEqual([])
  })
})
