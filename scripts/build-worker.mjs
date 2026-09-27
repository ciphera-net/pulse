#!/usr/bin/env node
/**
 * Build the analytics-import worker into ONE self-contained file:
 * public/workers/import.js.
 *
 * WHY IT IS BUILT HERE AND NOT BY NEXT (design §3.12b M2-n):
 * a browser refuses to start a Worker from another origin, whatever the CSP
 * says, and Next emits every chunk under `assetPrefix` — the static CDN zone in
 * staging and production (next.config.ts). `new Worker(new URL(…, import.meta.url))`
 * would therefore point cross-origin exactly where it has to work. So the worker
 * is bundled like the tracker is: a prebuild step writes it into public/, Next
 * serves it from the app's own origin, and `worker-src 'self'` already allows it.
 *
 * NEVER STALE AFTER A DEPLOY:
 *   - public/workers/ is GITIGNORED build output. Unlike the tracker (whose
 *     bare-alpine deploy step needs committed bytes), Next serves public/ from
 *     its own image, so the bytes shipped are always this build's.
 *   - /workers/import.js falls under next.config.ts's `no-cache, must-revalidate`
 *     rule for every path outside /_next/static, the rule that keeps HTML fresh.
 *   - It is excluded from the service-worker precache (next.config.ts
 *     `publicExcludes`), so an installed PWA cannot pin an old copy.
 *   - lib/import/protocol.ts's PROTOCOL_VERSION is compiled into both this file
 *     and the page, so a page and worker from different builds fail with a
 *     named error instead of exchanging malformed messages.
 *
 * The output must be exactly one file with no dynamic imports: a chunk it tried
 * to load would resolve against the page, and a classic worker cannot `import`.
 * lib/import/__tests__/worker-bundle.test.ts builds it and asserts both.
 */

import { build } from 'esbuild'
import { mkdirSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
export const WORKER_ENTRY = join(ROOT, 'lib', 'import', 'worker.ts')
export const WORKER_OUTFILE = join(ROOT, 'public', 'workers', 'import.js')

/**
 * @param {{ outfile?: string, write?: boolean }} [options]
 * @returns {Promise<import('esbuild').BuildResult<{ metafile: true }>>}
 */
export async function buildImportWorker({ outfile = WORKER_OUTFILE, write = true } = {}) {
  if (write) mkdirSync(dirname(outfile), { recursive: true })
  return build({
    entryPoints: [WORKER_ENTRY],
    outfile,
    bundle: true,
    // A classic worker script: `new Worker(url)` with no `type: 'module'`.
    format: 'iife',
    platform: 'browser',
    target: 'es2020',
    splitting: false,
    minify: true,
    sourcemap: false,
    // Bundled third-party licence notices (fflate is MIT) stay in the file.
    legalComments: 'eof',
    metafile: true,
    write,
    logLevel: 'silent',
  })
}

async function main() {
  const result = await buildImportWorker()
  const outputs = Object.keys(result.metafile.outputs)
  if (outputs.length !== 1) {
    console.error(`[build-worker] expected ONE output file, got ${outputs.length}: ${outputs.join(', ')}`)
    process.exitCode = 1
    return
  }
  const bytes = result.metafile.outputs[outputs[0]].bytes
  console.log(`[build-worker] wrote ${relative(ROOT, WORKER_OUTFILE)} (${bytes} B)`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('[build-worker] error:', err)
    process.exitCode = 1
  })
}
