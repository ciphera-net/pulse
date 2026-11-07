// The return from Mollie (copy deck §10.8.8): the page asks the server until it knows what became of the payment method
// update, and says only that. A fake clock that the fake sleep moves forward, so a minute of asking runs at once.
import { describe, it, expect, vi } from 'vitest'
import type { PaymentMethodUpdateState } from '@/lib/api/billing'
import { checkPaymentMethodUpdate, CHECK_TIMING, RETURN_WORDS } from '../paymentMethodReturn'

function harness(answers: (PaymentMethodUpdateState | Error | string)[]) {
  let t = 0
  const reads: number[] = []
  const controller = new AbortController()
  const onSlow = vi.fn()
  const read = vi.fn(async () => {
    reads.push(t)
    const next = answers.length > 1 ? answers.shift()! : answers[0]
    if (next instanceof Error) throw next
    return next as PaymentMethodUpdateState
  })
  const run = () =>
    checkPaymentMethodUpdate(read, {
      signal: controller.signal,
      onSlow,
      now: () => t,
      sleep: async (ms) => {
        t += ms
      },
    })
  return { run, read, reads, onSlow, controller }
}

describe('checkPaymentMethodUpdate', () => {
  it.each(['updated', 'failed', 'none'] as const)('a first answer of %s is the answer, asked once, with nothing said early', async (state) => {
    const h = harness([state])
    expect(await h.run()).toBe(state)
    expect(h.read).toHaveBeenCalledTimes(1)
    expect(h.onSlow).not.toHaveBeenCalled()
  })

  it('keeps asking while the server says pending, every 2 s, and says once, at 4 s, that it is not confirmed yet', async () => {
    const h = harness(['pending', 'pending', 'pending', 'pending', 'updated'])
    expect(await h.run()).toBe('updated')
    expect(h.reads).toEqual([0, 2_000, 4_000, 6_000, 8_000])
    expect(h.onSlow).toHaveBeenCalledTimes(1)
    expect(h.onSlow).toHaveBeenCalledWith('pending')
  })

  it('answers quickly enough and nothing is said early', async () => {
    const h = harness(['pending', 'updated'])
    expect(await h.run()).toBe('updated')
    expect(h.onSlow).not.toHaveBeenCalled()
  })

  it('a read that fails, or answers something else, is a failed read: asked again, and said as such at 4 s', async () => {
    const h = harness([new Error('502'), 'nonsense', new Error('502'), 'failed'])
    expect(await h.run()).toBe('failed')
    expect(h.read).toHaveBeenCalledTimes(4)
    expect(h.onSlow).toHaveBeenCalledWith('error')
  })

  it('stops asking after a minute without a definite answer, unresolved, having said so once', async () => {
    const h = harness(['pending'])
    expect(await h.run()).toBe('unresolved')
    expect(h.reads.at(-1)).toBe(CHECK_TIMING.giveUpAfterMs)
    expect(h.read).toHaveBeenCalledTimes(CHECK_TIMING.giveUpAfterMs / CHECK_TIMING.intervalMs + 1)
    expect(h.onSlow).toHaveBeenCalledTimes(1)
  })

  it('says nothing once the page is gone: an abort during a read or between reads ends it with null', async () => {
    let release: (s: PaymentMethodUpdateState) => void = () => {}
    const controller = new AbortController()
    const onSlow = vi.fn()
    const pending = checkPaymentMethodUpdate(() => new Promise((resolve) => (release = resolve)), { signal: controller.signal, onSlow })
    controller.abort()
    release('updated')
    expect(await pending).toBeNull()

    const h = harness(['pending'])
    const result = checkPaymentMethodUpdate(h.read, {
      signal: h.controller.signal,
      onSlow: h.onSlow,
      now: () => 0,
      sleep: async () => {
        h.controller.abort()
      },
    })
    expect(await result).toBeNull()
    expect(h.read).toHaveBeenCalledTimes(1)
    expect(onSlow).not.toHaveBeenCalled()
  })

  it('the words follow the copy deck: no dash, no ellipsis, no filler, and each error says what to do', () => {
    for (const words of Object.values(RETURN_WORDS)) {
      expect(words).not.toMatch(/[—–]|\.\.\.|…|\b(please|simply|just|easily)\b/i)
    }
    expect(RETURN_WORDS.updated).toBe('Payment method updated')
    expect(RETURN_WORDS.cancelled).toBe('Payment method not changed.')
    for (const words of [RETURN_WORDS.failed, RETURN_WORDS.notConfirmed, RETURN_WORDS.couldntCheck]) {
      expect(words).toMatch(/(Try again|check again)\.$/)
    }
  })
})
