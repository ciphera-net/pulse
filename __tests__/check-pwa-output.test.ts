// @vitest-environment node
//
// scripts/check-pwa-output.mjs reads the files `next build` emitted, because a test of next.config.ts's values
// passed while the built worker still registered the start-url rule (27-11-2026, audit §7). Each check is shown
// failing on the shape it exists to catch: the rule and the listener exactly as the deployed build carried them.

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkPwaOutput } from '../scripts/check-pwa-output.mjs'

// From the /sw.js built at f0eb68c2 and served 27-11-2026 (minified exactly so).
const START_URL_ROUTE =
  'e.registerRoute("/",new e.NetworkFirst({cacheName:"start-url",plugins:[{cacheWillUpdate:async({response:e})=>e&&"opaqueredirect"===e.type?new Response(e.body,{status:200,statusText:"OK",headers:e.headers}):e}]}),"GET"),'
const PAGES_ROUTE = 'e.registerRoute(({url:{pathname:e},sameOrigin:t})=>t&&!e.startsWith("/api/"),new e.NetworkFirst({cacheName:"pages",plugins:[]}),"GET");'
// next-pwa's client entry with reloadOnOnline left at its default (the chunk before f0eb68c2).
const RELOAD_LISTENER = 'window.addEventListener("online",()=>location.reload())'

function project(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'pwa-output-'))
  for (const [path, body] of Object.entries(files)) {
    const full = join(root, path)
    mkdirSync(join(full, '..'), { recursive: true })
    writeFileSync(full, body)
  }
  return root
}

const CLEAN = {
  'public/sw.js': `self.x=1;${PAGES_ROUTE}`,
  '.next/static/chunks/main-app.js': 'window.workbox=new Workbox("/sw.js",{scope:"/"});',
  '.next/static/chunks/app/sites/page.js': 'export default function(){return null}',
}

describe('check-pwa-output', () => {
  it('passes a build with neither the start-url rule nor the reload listener', () => {
    const { problems, chunks } = checkPwaOutput(project(CLEAN))
    expect(problems).toEqual([])
    expect(chunks).toBe(2)
  })

  it('fails a service worker that registers the start-url cache', () => {
    const { problems } = checkPwaOutput(project({ ...CLEAN, 'public/sw.js': `self.x=1;${START_URL_ROUTE}${PAGES_ROUTE}` }))
    expect(problems).toHaveLength(1)
    expect(problems[0]).toMatch(/start-url/)
  })

  it('fails a client script that reloads on the online event, in a nested chunk folder too', () => {
    const { problems } = checkPwaOutput(
      project({ ...CLEAN, '.next/static/chunks/app/8928-old.js': `!function(){${RELOAD_LISTENER}}();` }),
    )
    expect(problems).toHaveLength(1)
    expect(problems[0]).toMatch(/8928-old\.js reloads the page on the online event/)
  })

  it('fails when the build emitted no service worker or no client scripts', () => {
    expect(checkPwaOutput(project({ '.next/static/chunks/a.js': 'x' })).problems[0]).toMatch(/sw\.js is missing/)
    expect(checkPwaOutput(project({ 'public/sw.js': PAGES_ROUTE })).problems[0]).toMatch(/holds no scripts/)
  })
})
