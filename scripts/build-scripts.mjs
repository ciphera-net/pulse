#!/usr/bin/env node
/**
 * Build the tracking scripts that js.ciphera.net and Next's own /script.js serve.
 *
 * 🔴 05-09-2026 — THIS NOW BUILDS THE ROLLING ARTIFACT TOO, AND THAT IS THE POINT.
 * Until today the deploy uploaded the UNMINIFIED source to js.ciphera.net/script.js
 * (22,233 B raw / 7,668 B gzipped) while the budget below measured only the minified
 * versioned sibling (2,698 B gzipped) that a customer reached ONLY by toggling SRI on.
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
 *   2. enforces a gzip size budget (fail the build if the core script grows), and
 *   3. writes public/<file> (minified) and public/<file>.debug.js (the readable source).
 *
 * 07-11-2026: the versioned copies (dist/scripts/v<version>/), their SHA-384/SHA-512 hashes
 * and both manifests (public/script-versions.json, dist/scripts/versions.json) went with the
 * option to lock a site's script to one version (Subresource Integrity). The copies already
 * published at js.ciphera.net/v<version>/ stay on the CDN for tags pasted before then, and
 * nothing writes there any more.
 */

import { build } from 'esbuild'
import { gzipSync } from 'node:zlib'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const PUBLIC_DIR = join(ROOT, 'public')
// * The readable, reviewable, diff-able tracker source. `public/script.js` is its
// * BUILD OUTPUT and is committed so the deploy step (bare alpine, no node) can
// * upload it verbatim; .woodpecker/test.yml rebuilds it and fails when the commit
// * disagrees with a fresh build.
const SRC_DIR = join(ROOT, 'tracker')

// * script.interactions.js is the OPTIONAL companion: clicks, copies and form
// * submits. It is a separate artifact on purpose — see its header. Its budget is
// * its own, so growth there can never push the core over the published 3 KB.
// * script.note.js (1.8.0) is the line a site owner's own-visits link leaves on their site. The core
// * loads it from beside itself ONLY when the page was opened with ?pulse-ignore=on or =off, so no
// * visitor downloads it. (A tag pinned to v1.8.0 before 07-11-2026 loads it from that v1.8.0/
// * path, which is why the published copy there stays.)
const SCRIPTS = ['script.js', 'script.interactions.js', 'script.note.js']

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
  // * The companion's own ceiling. Deliberately small: it exists so that adding
  // * a capture type is a decision with a visible cost, exactly as the core's
  // * budget makes growth in the core a decision. Not a published claim — but a
  // * site that opts in still pays for it on every page load.
  'script.interactions.js': 1536, // ~1.5 KB gzipped (986B at three capture types)
  // * Loaded only by a site owner opening their own link; the ceiling keeps it a line of text.
  'script.note.js': 1024, // ~1 KB gzipped (842B at 1.8.0)
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

    console.log(
      `[build-scripts] ${file}: min ${min.length}B, gzip ${gz.length}B ` +
        `(budget ${budget === Infinity ? '∞' : budget}B) ${ok ? 'OK' : 'OVER BUDGET'}`,
    )
  }

  if (failed) {
    console.error('[build-scripts] FAILED: a script exceeds its gzip size budget.')
    process.exitCode = 1
    return
  }
  console.log('[build-scripts] wrote the rolling scripts (minified) and their .debug.js copies to public/')
}

main().catch((err) => {
  console.error('[build-scripts] error:', err)
  process.exitCode = 1
})
