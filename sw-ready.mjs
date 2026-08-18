// Decisive activation check. navigator.serviceWorker.ready resolves ONLY when a
// registration has an ACTIVE worker — so it cannot resolve if the Workbox precache
// install failed (a failed install leaves the worker redundant and never activates).
// Also re-loads a second time to confirm the SW serves the page from cache.
import { chromium } from '@playwright/test'

const URL_ = process.argv[2] || 'https://pulse-staging.ciphera.net/'
const browser = await chromium.launch()
const ctx = await browser.newContext({ serviceWorkers: 'allow' })
const page = await ctx.newPage()
const violations = []
page.on('console', m => { if (m.type() === 'error') violations.push(m.text()) })

await page.goto(URL_, { waitUntil: 'domcontentloaded' })
await page.waitForLoadState('networkidle').catch(() => {})

const ready = await page.evaluate(async () => {
  const timeout = new Promise(r => setTimeout(() => r({ timedOut: true }), 60000))
  const reg = await Promise.race([navigator.serviceWorker.ready, timeout])
  if (reg.timedOut) return { activated: false, reason: 'serviceWorker.ready never resolved' }
  return {
    activated: !!reg.active,
    state: reg.active?.state,
    scriptURL: reg.active?.scriptURL,
    scope: reg.scope,
  }
})

// Second load with the SW controlling: proves it survives a real navigation.
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForLoadState('networkidle').catch(() => {})
const second = await page.evaluate(async () => ({
  controlled: !!navigator.serviceWorker.controller,
  controllerScript: navigator.serviceWorker.controller?.scriptURL,
  precacheEntries: await caches.open('workbox-precache-v2-' + location.origin + '/')
    .then(c => c.keys()).then(k => k.length).catch(() => null),
}))

console.log(JSON.stringify({ ready, secondLoad: second, consoleErrors: violations }, null, 2))
await browser.close()
