// Round 8 (PUL-78): reading back an answer whose stream broke after it started, until the server keeps it, the
// question's time is up, or the question is stopped.
import { describe, it, expect, vi, afterEach } from 'vitest'
import type { AnalystTurn } from '@/lib/api/analyst'
import { RECOVERY_EVERY_MS, RECOVERY_LIMIT_MS, RECOVERY_READ_MS, waitForTurn } from '../recover'

const turn: AnalystTurn = {
  id: 't1',
  conversation_id: 'c1',
  site_id: 's1',
  question: 'Why did visitors change?',
  answer: 'Visitors rose from 48 to 56.',
  outcome: 'answered',
  steps: [],
  created_at: '2026-11-12T00:00:00Z',
}

type Read = (signal: AbortSignal) => Promise<AnalystTurn | null>

/** A read that never answers on its own: it ends only when its signal does. */
const hangs: Read = (signal) =>
  new Promise((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('Ended', 'AbortError'))))

afterEach(() => vi.useRealTimers())

describe('waitForTurn', () => {
  it('reads at once, then every few seconds, through a failed read, until the turn is kept', async () => {
    vi.useFakeTimers()
    const read = vi.fn<Read>().mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(turn)
    const got = waitForTurn(read, Date.now() + RECOVERY_LIMIT_MS, new AbortController().signal)
    await vi.advanceTimersByTimeAsync(0)
    expect(read).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(RECOVERY_EVERY_MS - 1)
    expect(read).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(read).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(RECOVERY_EVERY_MS)
    await expect(got).resolves.toBe(turn)
    expect(read).toHaveBeenCalledTimes(3)
  })

  it('reads one last time at the limit, then gives up', async () => {
    vi.useFakeTimers()
    const read = vi.fn<Read>().mockResolvedValue(null)
    let settled = false
    const got = waitForTurn(read, Date.now() + 10_000, new AbortController().signal).finally(() => (settled = true))
    await vi.advanceTimersByTimeAsync(9_999)
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await expect(got).resolves.toBeNull()
    // * At 0, 3, 6 and 9 seconds, and at the limit.
    expect(read).toHaveBeenCalledTimes(5)
  })

  it('gives up on a read that hangs, and reads again', async () => {
    vi.useFakeTimers()
    const read = vi.fn<Read>().mockImplementationOnce(hangs).mockResolvedValueOnce(turn)
    const got = waitForTurn(read, Date.now() + RECOVERY_LIMIT_MS, new AbortController().signal)
    await vi.advanceTimersByTimeAsync(RECOVERY_READ_MS)
    expect(read.mock.calls[0][0].aborted).toBe(true)
    await vi.advanceTimersByTimeAsync(RECOVERY_EVERY_MS)
    await expect(got).resolves.toBe(turn)
  })

  it('stops at once when the question is stopped, mid-read or between reads', async () => {
    vi.useFakeTimers()
    const midRead = new AbortController()
    const reading = vi.fn<Read>(hangs)
    const first = waitForTurn(reading, Date.now() + RECOVERY_LIMIT_MS, midRead.signal)
    await vi.advanceTimersByTimeAsync(0)
    midRead.abort()
    await expect(first).resolves.toBeNull()
    expect(reading).toHaveBeenCalledTimes(1)

    const between = new AbortController()
    const waiting = vi.fn<Read>().mockResolvedValue(null)
    const second = waitForTurn(waiting, Date.now() + RECOVERY_LIMIT_MS, between.signal)
    await vi.advanceTimersByTimeAsync(1_000)
    between.abort()
    await expect(second).resolves.toBeNull()
    await vi.advanceTimersByTimeAsync(RECOVERY_EVERY_MS)
    expect(waiting).toHaveBeenCalledTimes(1)
  })
})
