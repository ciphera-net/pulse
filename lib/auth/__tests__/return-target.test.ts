import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  rememberReturnTarget,
  peekReturnTarget,
  claimReturnTarget,
  forgetReturnTarget,
  RETURN_TARGET_TTL_MS,
} from '../return-target'

const KEY = 'pulse_auth_return_to'

describe('the sign-in return target', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.useRealTimers()
  })
  afterEach(() => vi.useRealTimers())

  it('remembers and returns what was asked for', () => {
    rememberReturnTarget('/join/abc123')
    expect(peekReturnTarget()).toBe('/join/abc123')
  })

  it('peeking does not spend it — the callback reads it twice', () => {
    // provisionWorkspaceUnlessJoining() peeks to decide whether an invite is
    // pending; landInApp() then claims it to navigate. A peek that consumed
    // would send every invited person to the default landing instead.
    rememberReturnTarget('/join/abc123')
    expect(peekReturnTarget()).toBe('/join/abc123')
    expect(peekReturnTarget()).toBe('/join/abc123')
    expect(claimReturnTarget()).toBe('/join/abc123')
    expect(peekReturnTarget()).toBeNull()
  })

  // 🔴 THE DEFECT THIS FILE EXISTS FOR (audit §4n). The slot had no lifetime,
  // so a target written days ago by an unrelated visit — a pricing click, a
  // deep link, a session that died on a `/setup/*` page — still beat the
  // resolved destination on the next sign-in, exactly once, and then vanished.
  // That is the "happened once, cannot reproduce" bug report.
  it('discards a target older than its lifetime', () => {
    rememberReturnTarget('/setup/org?plan=pro')
    const stored = JSON.parse(localStorage.getItem(KEY)!)
    stored.at = Date.now() - RETURN_TARGET_TTL_MS - 1
    localStorage.setItem(KEY, JSON.stringify(stored))

    expect(peekReturnTarget()).toBeNull()
    // And it is cleared, so it cannot hijack the sign-in after this one either.
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('keeps a target that is still inside its lifetime', () => {
    rememberReturnTarget('/join/abc123')
    const stored = JSON.parse(localStorage.getItem(KEY)!)
    stored.at = Date.now() - (RETURN_TARGET_TTL_MS - 1000)
    localStorage.setItem(KEY, JSON.stringify(stored))
    expect(peekReturnTarget()).toBe('/join/abc123')
  })

  it('treats a clock that jumped backwards as fresh, not expired', () => {
    // A machine whose time just synced can write a timestamp ahead of ours.
    // The value came from THIS browser for THIS journey; expiring it would
    // strand somebody mid-invite for a reason that has nothing to do with them.
    rememberReturnTarget('/join/abc123')
    const stored = JSON.parse(localStorage.getItem(KEY)!)
    stored.at = Date.now() + 60_000
    localStorage.setItem(KEY, JSON.stringify(stored))
    expect(peekReturnTarget()).toBe('/join/abc123')
  })

  it('honours a bare string written by the previous build, once', () => {
    // ⚠️ Deliberate. A legacy value carries no timestamp, so in-flight and
    // stale are indistinguishable — and dropping it is the worse mistake: it
    // strands somebody mid-invite across a deploy, on the one path where the
    // target is the whole point. One-shot either way.
    localStorage.setItem(KEY, '/join/legacy-code')
    expect(claimReturnTarget()).toBe('/join/legacy-code')
    expect(peekReturnTarget()).toBeNull()
  })

  it('drops a value that parses but is not a target', () => {
    localStorage.setItem(KEY, JSON.stringify({ nope: true }))
    expect(peekReturnTarget()).toBeNull()
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('never writes an empty target', () => {
    rememberReturnTarget('')
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('survives storage being unavailable', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    // A blocked write must cost a default landing, never a failed sign-in.
    expect(() => rememberReturnTarget('/join/abc')).not.toThrow()
    spy.mockRestore()

    const read = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(peekReturnTarget()).toBeNull()
    read.mockRestore()

    const rm = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(() => forgetReturnTarget()).not.toThrow()
    rm.mockRestore()
  })
})
