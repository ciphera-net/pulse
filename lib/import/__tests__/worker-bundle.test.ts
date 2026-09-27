// @vitest-environment node
//
// The prebuilt worker (§3.12b M2-n): scripts/build-worker.mjs bundles
// lib/import/worker.ts into ONE self-contained classic script,
// public/workers/import.js, served from the app's own origin.
//
// This builds it exactly as `npm run build:worker` does and checks the two
// properties a Worker served by path depends on — one file, and no chunk it
// would try to load (a dynamic import would resolve against the page, and a
// classic worker cannot `import` at all) — then RUNS the built code as a
// worker and drives it with the real orchestrator against an in-memory server
// that enforces M2-r. Gate 6 repeats that in a real browser on staging.

import { describe, expect, it } from 'vitest'
import { buildImportWorker } from '../../../scripts/build-worker.mjs'
import { PLAN_LIMITS } from '../core/plan'
import { runImport } from '../index'
import { runPipeline } from '../pipeline'
import { plausibleFixtureFile } from './fixtures/plausible-export'
import { umamiFixtureFile } from './fixtures/umami-export'
import { FakeImportServer } from './support/fake-server'
import { bundledWorker } from './support/workers'

interface Built {
  outputFiles: { path: string; text: string }[]
  metafile: { outputs: Record<string, { imports: { path: string; kind: string }[] }> }
}

async function build(): Promise<Built> {
  return (await buildImportWorker({ outfile: '/virtual/workers/import.js', write: false })) as Built
}

describe('the prebuilt worker bundle', () => {
  it('is exactly one self-contained file', async () => {
    const result = await build()
    expect(result.outputFiles).toHaveLength(1)
    expect(Object.keys(result.metafile.outputs)).toHaveLength(1)
    const [output] = Object.values(result.metafile.outputs)
    expect(output.imports).toEqual([])
  })

  it('loads no chunk and imports nothing at run time', async () => {
    const code = (await build()).outputFiles[0].text
    expect(code).not.toMatch(/\bimport\s*\(/)
    expect(code).not.toMatch(/\bimportScripts\s*\(/)
    expect(code).not.toMatch(/\brequire\s*\(/)
    expect(code).not.toMatch(/^\s*(import|export)\s/m)
    // A classic script: one IIFE.
    expect(code.trimStart().startsWith('"use strict";(()=>{')).toBe(true)
  })

  it('holds no credential code: no session header, no cookie, no API client', async () => {
    const code = (await build()).outputFiles[0].text
    expect(code).not.toMatch(/Authorization|X-CSRF-Token|document\.cookie|\/api\/v1|fetch\(/)
  })

  it('runs as a worker and uploads the synthetic export end to end through the orchestrator', async () => {
    const code = (await build()).outputFiles[0].text
    const server = new FakeImportServer()
    const status = await runImport({
      siteId: server.siteId,
      source: 'plausible',
      file: plausibleFixtureFile(),
      transport: server.transport,
      createWorker: () => bundledWorker(code),
      client: { minIntervalMs: 0, sleep: async () => {} },
      now: () => new Date('2026-09-27T12:00:00Z'),
    })
    expect(status.status).toBe('completed')
    // Byte for byte the rows the pipeline plans in process.
    const { parts } = await runPipeline(
      { source: 'plausible', files: [plausibleFixtureFile()], clip: null, timeZone: 'Europe/Brussels', siteDomain: null },
      { planLimits: PLAN_LIMITS },
    )
    const sent = server.requests.filter((r) => r.path.endsWith('/batches')).map((r) => JSON.parse(r.body ?? '{}').rows)
    expect(sent).toEqual(parts.map((p) => JSON.parse(p.rowsJson)))
  })

  it('runs the raw source (M8) end to end too: folded in the worker, in the site\'s zone, real visits', async () => {
    const code = (await build()).outputFiles[0].text
    const server = new FakeImportServer()
    const status = await runImport({
      siteId: server.siteId,
      source: 'umami',
      file: umamiFixtureFile(),
      transport: server.transport,
      createWorker: () => bundledWorker(code),
      client: { minIntervalMs: 0, sleep: async () => {} },
      now: () => new Date('2026-09-27T12:00:00Z'),
    })
    expect(status).toMatchObject({ status: 'completed', source: 'umami', kind: 'upload_raw', visits_are_visitors: false })
    const create = server.requests.find((r) => r.method === 'POST' && /\/data-imports$/.test(r.path))
    expect(JSON.parse(create?.body ?? '{}')).toMatchObject({
      source: 'umami',
      // A raw source is bucketed in the site's own zone (M2-g).
      source_timezone: server.siteTimezone,
      visits_are_visitors: false,
      skipped: { bad_timestamp: 2, missing_field: 3, not_a_pageview: 3 },
    })
    const { parts } = await runPipeline(
      { source: 'umami', files: [umamiFixtureFile()], clip: null, timeZone: server.siteTimezone },
      { planLimits: PLAN_LIMITS },
    )
    const sent = server.requests.filter((r) => r.path.endsWith('/batches')).map((r) => JSON.parse(r.body ?? '{}').rows)
    expect(sent).toEqual(parts.map((p) => JSON.parse(p.rowsJson)))
  })
})
