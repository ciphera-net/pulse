#!/usr/bin/env node
/**
 * Build the immutable, versioned tracking-script artifacts.
 *
 * 🔴 05-09-2026 — THIS NOW BUILDS THE ROLLING ARTIFACT TOO, AND THAT IS THE POINT.
 * Until today the deploy uploaded the UNMINIFIED source to js.ciphera.net/script.js
 * (22,233 B raw / 7,668 B gzipped) while the budget below measured only the minified
 * versioned sibling (2,698 B gzipped) that a customer reaches ONLY by toggling SRI on.
 * So a size budget existed, passed on every build, and never once looked at the bytes
 * customers download — which is how ~35 published "5 KB"/"1.6 KB"/"under 2KB" marketing
 * claims drifted apart with nothing to catch them.
 * Analysis: Pulse/docs/plans/05-09-2026-script-size-claim-durability.md
 *
 * The readable source now lives in `tracker/script.js` and `public/script.js` is BUILT
 * from it, so both serving paths — the Bunny zone AND Next's own /script.js — carry the
 * same minified bytes, and GZIP_BUDGET is load-bearing for the first time.
 *
 * It:
 *   1. minifies the three source scripts,
 *   2. enforces a gzip size budget (fail the build if the core script grows),
 *   3. computes SHA-384 + SHA-512 over the EXACT shipped (minified) bytes, and
 *   4. writes:
 *        - dist/scripts/<version>/*.js         (the immutable artifacts to publish)
 *        - public/script-versions.json         (frontend manifest: the snippet UI
 *                                               reads this to emit a versioned SRI tag)
 *        - dist/scripts/versions.json          (append-only publish manifest)
 *
 * The versioned URLs are `https://js.ciphera.net/v<version>/<file>` and are
 * published as immutable objects (Cache-Control: immutable, 1y) — bytes for a
 * version are NEVER overwritten. New bytes ⇒ a new version. SRI is pinned only
 * against these, never against the rolling URL (which auto-updates).
 */

import { build } from 'esbuild'
import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const PUBLIC_DIR = join(ROOT, 'public')
// * The readable, reviewable, diff-able tracker source. `public/script.js` is its
// * BUILD OUTPUT and is committed so the deploy step (bare alpine, no node) can
// * upload it verbatim — the same "generated file must agree at commit time"
// * contract that already governs public/script-sri.json in .woodpecker/test.yml.
const SRC_DIR = join(ROOT, 'tracker')
const DIST_ROOT = join(ROOT, 'dist', 'scripts')

// * Bump this to publish a new immutable version. Bytes for an existing version
// * must never change — CI enforces immutability on publish.
const SCRIPT_VERSION = '1.2.0'
const BASE_URL = 'https://js.ciphera.net'

const SCRIPTS = ['script.js']

// * Gzip size budget per file (bytes). The core script is the one customers pay
// * for on every page load; keep it lean. Fail the build if it regresses.
//
// * 🔑 This is the number the marketing copy is allowed to cite as a CEILING
// * ("under 3 KB gzipped — the build fails if it exceeds it"), which is the only
// * formulation that cannot go stale, because it is enforced rather than asserted.
// * Raising it is therefore a COPY EVENT, not a dependency bump: grep the estate
// * for the published claim before you touch it.
const GZIP_BUDGET = {
  'script.js': 3072, // ~3 KB gzipped
}

function sri(algo, bytes) {
  return `${algo}-${createHash(algo).update(bytes).digest('base64')}`
}

async function minify(file) {
  const src = readFileSync(join(SRC_DIR, file), 'utf8')
  const result = await build({
    stdin: { contents: src, loader: 'js', sourcefile: file },
    minify: true,
    target: 'es2017',
    format: 'iife',
    legalComments: 'none',
    write: false,
  })
  return Buffer.from(result.outputFiles[0].contents)
}

async function main() {
  const versionDir = join(DIST_ROOT, `v${SCRIPT_VERSION}`)
  mkdirSync(versionDir, { recursive: true })

  const files = {}
  const manifestFiles = {}
  let failed = false

  for (const file of SCRIPTS) {
    if (!existsSync(join(SRC_DIR, file))) {
      console.error(`[build-scripts] missing source: tracker/${file}`)
      process.exitCode = 1
      return
    }
    const min = await minify(file)
    const gz = gzipSync(min, { level: 9 })
    const budget = GZIP_BUDGET[file] ?? Infinity
    const ok = gz.length <= budget
    if (!ok) failed = true

    writeFileSync(join(versionDir, file), min)

    // 🔴 THE ROLLING ARTIFACT. Written only when the budget PASSES — an over-budget
    // build must not leave a bigger script on disk for the deploy to pick up, which
    // would ship the regression the check exists to stop while the pipeline is red.
    // Next serves public/ directly, so this one write fixes BOTH serving paths
    // (pulse.ciphera.net/script.js and the Bunny zone behind js.ciphera.net).
    if (ok) {
      writeFileSync(join(PUBLIC_DIR, file), min)
      // The readable copy, published beside it. Minifying the served script costs
      // debuggability on a customer's site; this is what buys it back, and it is
      // why the source move is not a net loss for anyone debugging an install.
      writeFileSync(join(PUBLIC_DIR, file.replace(/\.js$/, '.debug.js')), readFileSync(join(SRC_DIR, file)))
    }

    const sha384 = sri('sha384', min)
    const sha512 = sri('sha512', min)
    files[file] = {
      path: `/v${SCRIPT_VERSION}/${file}`,
      url: `${BASE_URL}/v${SCRIPT_VERSION}/${file}`,
      sha384,
      sha512,
    }
    manifestFiles[file] = { path: `/v${SCRIPT_VERSION}/${file}`, sha384, sha512 }

    console.log(
      `[build-scripts] ${file}: min ${min.length}B, gzip ${gz.length}B ` +
        `(budget ${budget === Infinity ? '∞' : budget}B) ${ok ? 'OK' : 'OVER BUDGET'}`,
    )
  }

  // Frontend manifest — the snippet UI reads this to build the versioned SRI tag.
  const frontendManifest = {
    version: SCRIPT_VERSION,
    baseUrl: BASE_URL,
    files: manifestFiles,
  }
  writeFileSync(
    join(PUBLIC_DIR, 'script-versions.json'),
    JSON.stringify(frontendManifest, null, 2) + '\n',
  )

  // Append-only publish manifest. Preserve prior entries if present.
  const versionsPath = join(DIST_ROOT, 'versions.json')
  let versions = []
  if (existsSync(versionsPath)) {
    try {
      versions = JSON.parse(readFileSync(versionsPath, 'utf8'))
    } catch {
      versions = []
    }
  }
  if (!versions.find((v) => v.version === SCRIPT_VERSION)) {
    versions.push({ version: SCRIPT_VERSION, files, notes: '' })
  }
  writeFileSync(versionsPath, JSON.stringify(versions, null, 2) + '\n')

  if (failed) {
    console.error('[build-scripts] FAILED: a script exceeds its gzip size budget.')
    process.exitCode = 1
    return
  }
  console.log(
    `[build-scripts] wrote public/script.js (rolling, minified), public/script.debug.js, ` +
      `dist/scripts/v${SCRIPT_VERSION}/ and public/script-versions.json`,
  )
}

main().catch((err) => {
  console.error('[build-scripts] error:', err)
  process.exitCode = 1
})
