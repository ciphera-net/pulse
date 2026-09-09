// @vitest-environment node
//
// The crash beacon's sink. This endpoint used to keep only { message, url,
// timestamp } and drop the `stack` the client was already sending — which is why
// three days of "Dashboard failed to load" on the owner's PWA could be identified
// as React #185 (an infinite render loop) but never attributed to a component.
// Audit: Pulse/docs/audits/09-09-2026-pwa-dashboard-failed-to-load.md.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { POST } from '../route'

function post(body: unknown) {
  return new Request('http://localhost/api/client-errors', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

describe('POST /api/client-errors', () => {
  let warn: ReturnType<typeof vi.spyOn>
  beforeEach(() => { warn = vi.spyOn(console, 'warn').mockImplementation(() => {}) })
  afterEach(() => { vi.restoreAllMocks() })

  const logged = () => JSON.parse(warn.mock.calls[0][1] as string)

  it('KEEPS THE STACK — the field that names the component', async () => {
    await POST(post({
      message: 'Minified React error #185',
      stack: 'Error: Minified React error #185\n    at CommandDeck (deck-1a2b.js:4:19)',
      url: 'https://pulse.ciphera.net/sites/abc',
      timestamp: '2026-09-09T01:44:08.920Z',
      chunkRecovery: false,
    }))
    const out = logged()
    expect(out.stack).toContain('at CommandDeck')
    expect(out.message).toBe('Minified React error #185')
    expect(out.url).toBe('https://pulse.ciphera.net/sites/abc')
    expect(out.chunkRecovery).toBe(false)
  })

  it('keeps chunkRecovery=true distinguishable from a real crash', async () => {
    await POST(post({ message: 'Loading chunk 9 failed', chunkRecovery: true }))
    expect(logged().chunkRecovery).toBe(true)
  })

  it('truncates a hostile stack — the route is unauthenticated by necessity', async () => {
    await POST(post({ message: 'x', stack: 'A'.repeat(50_000) }))
    expect(logged().stack.length).toBeLessThanOrEqual(2001)
  })

  it('omits absent fields rather than logging empty ones', async () => {
    await POST(post({ message: 'bare' }))
    const out = logged()
    expect(out.message).toBe('bare')
    expect('stack' in out).toBe(false)
    expect('chunkRecovery' in out).toBe(false)
  })

  it('answers 204 and logs nothing for a malformed body', async () => {
    const res = await POST(post('not json'))
    expect(res.status).toBe(204)
    expect(warn).not.toHaveBeenCalled()
  })
})
