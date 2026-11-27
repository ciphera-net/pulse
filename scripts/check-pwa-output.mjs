#!/usr/bin/env node
// After `next build` (package.json `postbuild`): the PWA files the build EMITTED, checked on the files themselves.
//
// pulse#1126 (27-11-2026) set `cacheStartUrl: false` in next.config.ts and its test of that value passed, while the
// service worker it built still registered the start-url rule: next-pwa 10.2.9 never reads that option. A config value
// is not the output, so this reads the output:
//   1. public/sw.js exists and registers no `start-url` cache. That rule stored `/`'s signed-in redirect as an empty
//      200, so the installed app opened offline on a blank page with no script, which stayed blank.
//   2. No client chunk carries next-pwa's reload-on-reconnect listener. It reloaded every open page the moment a Mac
//      woke, before the static file host answered, and left a page showing only "Skip to content".
// Record: Pulse/docs/audits/16-11-2026-blank-dashboard-and-performance-reports.md §7.
//
// Usage: node scripts/check-pwa-output.mjs [project root]   (exit 1 with one line per problem)

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const START_URL_RULE = /cacheName:\s*["']start-url["']/
export const RELOAD_ON_ONLINE = /addEventListener\(\s*["']online["']\s*,[^;]{0,80}?location\.reload\(\)/

function jsFiles(dir) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...jsFiles(path))
    else if (entry.name.endsWith('.js')) out.push(path)
  }
  return out
}

export function checkPwaOutput(root) {
  const problems = []
  const sw = join(root, 'public', 'sw.js')
  if (!existsSync(sw)) {
    problems.push('public/sw.js is missing: the build did not emit the service worker')
  } else if (START_URL_RULE.test(readFileSync(sw, 'utf8'))) {
    problems.push('public/sw.js registers the start-url cache: set dynamicStartUrl: false in next.config.ts')
  }
  const chunksDir = join(root, '.next', 'static', 'chunks')
  const chunks = existsSync(chunksDir) ? jsFiles(chunksDir) : []
  if (chunks.length === 0) problems.push('.next/static/chunks holds no scripts: run this after next build')
  for (const file of chunks) {
    if (RELOAD_ON_ONLINE.test(readFileSync(file, 'utf8'))) {
      problems.push(`${file.slice(root.length + 1)} reloads the page on the online event: set reloadOnOnline: false in next.config.ts`)
    }
  }
  return { problems, chunks: chunks.length }
}

// Run as a script (not imported by the test). fileURLToPath, never a `file://` string compare: a path with a
// space is percent-encoded in import.meta.url, and the check would then skip itself and exit 0.
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const root = resolve(process.argv[2] || process.cwd())
  const { problems, chunks } = checkPwaOutput(root)
  if (problems.length > 0) {
    for (const p of problems) console.error(`FAIL: ${p}`)
    process.exit(1)
  }
  console.log(`PWA output OK: public/sw.js has no start-url rule, and none of ${chunks} client scripts reloads on reconnect`)
}
