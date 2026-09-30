#!/usr/bin/env node
/**
 * A generic runner for a one-off TypeScript script (scripts/generate-seo.ts
 * and any future one) that lives inside this repo's own `@/`-free, plain
 * relative-import module graph (lib/*.ts).
 *
 * WHY THIS EXISTS INSTEAD OF PLAIN `node scripts/foo.ts`. Node's own type
 * stripping runs each module through its native ESM resolver, which —
 * unlike Next's bundler-style `moduleResolution` — requires the LITERAL file
 * extension on every relative import. lib/marketing-routes.ts imports
 * lib/comparisons.ts, which imports lib/comparisonLogos.ts, extensionless,
 * exactly as Next.js expects; rewriting that whole chain to satisfy node's
 * stricter resolver would touch files this change has no reason to touch,
 * and would make those files unlike every other import in the codebase.
 *
 * esbuild is already a devDependency (vitest's own toolchain uses it), so
 * this adds no new dependency: it bundles the script's own relative-import
 * graph — resolving extensions the way Next's bundler does — into one
 * temporary ESM file, leaves real npm packages as ordinary `import`s for
 * Node to resolve normally (there are none in this graph today), runs it,
 * and deletes the temp file whether the script succeeded or not.
 */
import { build } from 'esbuild'
import { pathToFileURL } from 'url'
import path from 'path'
import os from 'os'
import fs from 'fs'

const entry = process.argv[2]
if (!entry) {
  console.error('usage: node scripts/run-ts.mjs <entry.ts> [args...]')
  process.exit(1)
}

const outfile = path.join(
  os.tmpdir(),
  `pulse-run-ts-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`
)

await build({
  entryPoints: [path.resolve(entry)],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  packages: 'external', // real npm packages stay real imports; nothing to bundle here today
  sourcemap: 'inline',
  logLevel: 'silent',
})

try {
  const mod = await import(pathToFileURL(outfile).href)
  // The entry has no top-level side effects (so it stays safely importable
  // from tests) — it exports `main()` as the one function this wrapper
  // exists to call.
  if (typeof mod.main !== 'function') {
    console.error(`${entry} exports no main() — nothing to run`)
    process.exit(1)
  }
  await mod.main()
} finally {
  fs.rmSync(outfile, { force: true })
}
