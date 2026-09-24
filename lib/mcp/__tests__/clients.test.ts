import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/api/client', () => ({ API_URL: 'https://pulse-api.ciphera.net' }))

import { MCP_CLIENTS, mcpServerUrl } from '../clients'

// The Settings → MCP steps (PULSE-54). What these pin: the server URL is derived from the API
// origin the app talks to (never hard-coded, so staging shows staging); every assistant has
// numbered steps and the URL where a value is pasted; the Cursor config carries the
// pre-registered client id.
describe('mcpServerUrl', () => {
  it('is the API origin plus /mcp, whatever path the API URL carries', () => {
    expect(mcpServerUrl('https://pulse-api-staging.ciphera.net')).toBe('https://pulse-api-staging.ciphera.net/mcp')
    expect(mcpServerUrl('https://pulse-api.ciphera.net/api/v1/')).toBe('https://pulse-api.ciphera.net/mcp')
    expect(mcpServerUrl()).toBe('https://pulse-api.ciphera.net/mcp')
  })
})

describe('MCP_CLIENTS', () => {
  const url = 'https://pulse-api.example.test/mcp'
  it('has the eight tiles, ids unique, only Other without a mark', () => {
    expect(MCP_CLIENTS.map((c) => c.id)).toEqual(['claude', 'claude-code', 'chatgpt', 'cursor', 'vscode', 'lechat', 'copilot', 'other'])
    expect(MCP_CLIENTS.filter((c) => !c.mark).map((c) => c.id)).toEqual(['other'])
    for (const c of MCP_CLIENTS) if (c.mark) expect(c.mark).toMatch(/^\/connect\/[a-z]+-v\d+\.(png|svg)$/)
  })
  it('gives every assistant at least two steps, and uses the URL it is given', () => {
    for (const c of MCP_CLIENTS) {
      const steps = c.steps(url)
      expect(steps.length, c.id).toBeGreaterThanOrEqual(2)
      const text = JSON.stringify(steps)
      expect(text, c.id).toContain(url)
      expect(text, c.id).not.toContain('pulse-api.ciphera.net')
    }
  })
  it("carries Cursor's pre-registered client id in its config", () => {
    const cfg = MCP_CLIENTS.find((c) => c.id === 'cursor')!.steps(url)[0].copy!.code
    expect(JSON.parse(cfg)).toEqual({ mcpServers: { pulse: { url, auth: { CLIENT_ID: 'pulse-analytics-cursor' } } } })
  })
})
