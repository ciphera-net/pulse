#!/usr/bin/env node
/**
 * Build the immutable, versioned tracking-script artifacts.
 *
 * This is deliberately SEPARATE from the rolling `public/*.js` that the main
 * deploy uploads to js.ciphera.net/script.js. It:
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
const DIST_ROOT = join(ROOT, 'dist', 'scripts')

// * Bump this to publish a new immutable version. Bytes for an existing version
// * must never change — CI enforces immutability on publish.
const SCRIPT_VERSION = '1.0.0'
const BASE_URL = 'https://js.ciphera.net'

const SCRIPTS = ['script.js', 'script.frustration.js', 'script.interactions.js']

// * Gzip size budget per file (bytes). The core script is the one customers pay
// * for on every page load; keep it lean. Fail the build if it regresses.
const GZIP_BUDGET = {
  'script.js': 3072, // ~3 KB gzipped
  'script.frustration.js': 3072,
  'script.interactions.js': 2048,
}

function sri(algo, bytes) {
  return `${algo}-${createHash(algo).update(bytes).digest('base64')}`
}

async function minify(file) {
  const src = readFileSync(join(PUBLIC_DIR, file), 'utf8')
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
    if (!existsSync(join(PUBLIC_DIR, file))) {
      console.error(`[build-scripts] missing source: public/${file}`)
      process.exitCode = 1
      return
    }
    const min = await minify(file)
    const gz = gzipSync(min, { level: 9 })
    const budget = GZIP_BUDGET[file] ?? Infinity
    const ok = gz.length <= budget
    if (!ok) failed = true

    writeFileSync(join(versionDir, file), min)

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
  console.log(`[build-scripts] wrote dist/scripts/v${SCRIPT_VERSION}/ and public/script-versions.json`)
}

main().catch((err) => {
  console.error('[build-scripts] error:', err)
  process.exitCode = 1
})
