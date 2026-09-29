// @vitest-environment node
//
// The sources list (M11-b) is read during render, so a body of the wrong shape
// must narrow to what can be read, never throw and take the settings page down.

import { describe, expect, it } from 'vitest'
import { drivableSources } from '../useImportSources'

describe('drivableSources', () => {
  it('keeps the server order and what this build can drive', () => {
    expect(
      drivableSources([
        { source: 'ga4', kind: 'oauth', enabled: true },
        { source: 'plausible', kind: 'upload_aggregate', enabled: true },
        { source: 'matomo', kind: 'api_key', enabled: true },
        { source: 'fathom', kind: 'upload_aggregate', enabled: false },
      ]).map((s) => [s.id, s.flow]),
    ).toEqual([
      ['ga4', 'ga4'],
      ['plausible', 'upload'],
      ['matomo', 'matomo'],
    ])
  })

  // M5 (PULSE-140): GA4's sign-in flow is built, so a listed ga4 is shown; the
  // server still owns WHETHER it is listed (GA4_IMPORT_ENABLED gates /sources).
  it('shows GA4 only when the server lists it as an enabled oauth source', () => {
    expect(drivableSources([{ source: 'ga4', kind: 'oauth', enabled: true }]).map((s) => s.flow)).toEqual(['ga4'])
    expect(drivableSources([{ source: 'ga4', kind: 'oauth', enabled: false }])).toEqual([])
    expect(drivableSources([{ source: 'ga4', kind: 'api_key', enabled: true }])).toEqual([])
    expect(drivableSources([{ source: 'ga4', kind: 'upload_raw', enabled: true }])).toEqual([])
    // Another tool on the oauth kind is not GA4's flow.
    expect(drivableSources([{ source: 'matomo', kind: 'oauth', enabled: true }])).toEqual([])
  })

  it('drops an entry with no kind, a null kind or no source instead of throwing', () => {
    const entries = [
      { source: 'plausible', enabled: true },
      { source: 'plausible', kind: null, enabled: true },
      { kind: 'upload_aggregate', enabled: true },
      null,
      'plausible',
      { source: 'matomo', kind: 'api_key', enabled: true },
    ] as never
    expect(drivableSources(entries).map((s) => s.id)).toEqual(['matomo'])
  })

  it('reads a list that is not a list as no sources', () => {
    for (const body of [{}, 'plausible', 7, null, undefined]) expect(drivableSources(body as never)).toEqual([])
  })
})
