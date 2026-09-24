import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Nothing may frame Pulse — least of all the MCP consent page, whose Allow
 * button is what a clickjacking page would want pressed (threat model T3,
 * PULSE-41). Both the CSP form and the legacy header, because each is what
 * some browser honours. Source-text: the CSP is assembled at build time in
 * next.config.ts and there is no runtime seam to ask.
 */
const CONFIG = readFileSync(join(__dirname, '../../next.config.ts'), 'utf8')

describe('Pulse cannot be framed', () => {
  it("carries frame-ancestors 'none' in the CSP", () => {
    expect(CONFIG).toMatch(/^\s*"frame-ancestors 'none'",\s*$/m)
  })

  it('keeps X-Frame-Options: DENY', () => {
    expect(CONFIG).toMatch(/key: 'X-Frame-Options', value: 'DENY'/)
  })
})
