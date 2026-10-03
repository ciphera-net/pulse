import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * pulse.ciphera.net is served by two apps behind one Ingress once the
 * marketing pages move out (PULSE-158). The route test tells them apart by
 * this header, so every dashboard response must name the dashboard — on the
 * catch-all '/(.*)' block, not on some subset of routes. Source-text: the
 * headers are assembled at build time in next.config.ts.
 */
const CONFIG = readFileSync(join(__dirname, '../../next.config.ts'), 'utf8')

describe('the dashboard names itself', () => {
  it("sends x-pulse-app: dashboard from the catch-all headers block", () => {
    const catchAll = CONFIG.slice(CONFIG.indexOf("source: '/(.*)'"))
    const block = catchAll.slice(0, catchAll.indexOf('],'))
    expect(block).toMatch(/\{ key: 'x-pulse-app', value: 'dashboard' \}/)
  })
})
