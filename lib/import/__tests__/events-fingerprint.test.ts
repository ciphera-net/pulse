// @vitest-environment node
//
// M12-c, the survey's 🔴 trap (§3.12m12): the fingerprint covers every part's
// rows, so opening a new source table changes the fingerprint of any import
// re-parsed after the deploy, which turns a resume into a guaranteed
// `409 plan_mismatch`. Two guarantees hold it:
//
//   1. a plan built WITHOUT events (the resume of a pre-M12 import) is
//      byte-identical to what the pre-M12 code planned from the same file;
//   2. a file with no custom events plans exactly as before, events on or off.
//
// The pinned values were computed by the pre-M12 library itself
// (`bfb0f011`, staging before M12) over the same fixtures, not by this code:
// a change that moves them is a change every in-flight import would feel.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { runPipeline } from '../pipeline'
import { plausibleFixtureFile } from './fixtures/plausible-export'
import { umamiFixtureFile } from './fixtures/umami-export'

/** runPipeline's fingerprints at bfb0f011 (timeZone UTC, no clip, no site domain). */
const PRE_M12 = {
  plausibleFixture: '59f272cc4061131e71267239b52560d8604a5b46514ae20f9c4179306cea74d3',
  umamiReal: 'dcbc9d853b359ac375f7d30ca664cb619f43d634fd93ee32c6c50edd8535aec0',
  umamiFixture: 'bcbd340f430f0a97156f1a84cf340c2a5939405473c920fc16aab809ceaae923',
} as const

const umamiReal = () =>
  new File(
    [readFileSync(fileURLToPath(new URL('../sources/__tests__/fixtures/umami-published-query.csv', import.meta.url)), 'utf8')],
    'umami-export.csv',
  )

async function fingerprint(source: 'plausible' | 'umami', file: File, events: boolean) {
  const { summary } = await runPipeline({ source, files: [file], clip: null, timeZone: 'UTC', siteDomain: null, events })
  return summary
}

describe('M12-c: a plan without events is the pre-M12 plan, byte for byte', () => {
  it.each([
    ['the Plausible fixture (one custom event)', 'plausible', plausibleFixtureFile, PRE_M12.plausibleFixture],
    ['the real Umami export (four custom events)', 'umami', umamiReal, PRE_M12.umamiReal],
    ['the Umami fixture (one custom event)', 'umami', umamiFixtureFile, PRE_M12.umamiFixture],
  ] as const)('%s, events off, fingerprints as it did before M12', async (_what, source, file, pinned) => {
    const off = await fingerprint(source, file(), false)
    expect(off.fingerprint).toBe(pinned)
    expect(off.events).toEqual([])
    // With events on, the same file is a different plan: that is what the bit is for.
    const on = await fingerprint(source, file(), true)
    expect(on.fingerprint).not.toBe(pinned)
    expect(on.events.length).toBeGreaterThan(0)
  })

  it('a Plausible file with no custom events plans exactly as before, events on or off', async () => {
    const noEvents = () =>
      plausibleFixtureFile((files) => {
        const k = Object.keys(files).find((f) => f.startsWith('imported_custom_events_')) as string
        files[k] = 'date,name,link_url,path,visitors,events\n'
      })
    expect((await fingerprint('plausible', noEvents(), true)).fingerprint).toBe(PRE_M12.plausibleFixture)
    expect((await fingerprint('plausible', noEvents(), false)).fingerprint).toBe(PRE_M12.plausibleFixture)
  })

  it('the fingerprint depends on the file only: the plan carries source labels, never a Pulse name (M12-b)', async () => {
    const { summary } = await runPipeline(
      { source: 'plausible', files: [plausibleFixtureFile()], clip: null, timeZone: 'UTC', siteDomain: null, events: true },
    )
    // The summary has no map in it; the map is chosen after the plan and sent with create.
    expect(Object.keys(summary)).not.toContain('event_map')
    expect(summary.events).toEqual([{ source_name: 'Signup', count: 1 }])
  })
})
