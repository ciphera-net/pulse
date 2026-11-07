import type { PaymentMethodUpdateState } from '@/lib/api/billing'

/**
 * The return from Mollie after "Update payment method" (copy deck §10.5, §10.8.8). Mollie sends every outcome but an
 * explicit cancel back to the same address, so arriving there proves nothing: the page asks the server until it knows,
 * and says only what the server confirmed.
 */

/** The words the return can end with. "Payment method updated" and "Payment method not changed." are §10.5's. */
export const RETURN_WORDS = {
  updated: 'Payment method updated',
  cancelled: 'Payment method not changed.',
  failed: "Payment method not changed: the payment didn't go through at Mollie. Try again.",
  notConfirmed: "The new payment method isn't confirmed yet. Reload this page in a minute to check again.",
  couldntCheck: "Couldn't check the new payment method. Reload this page to check again.",
} as const

/** What the page learned: a definite answer, or `unresolved` once it stopped asking without one. */
export type PaymentMethodCheck = 'updated' | 'failed' | 'none' | 'unresolved'

export interface CheckTiming {
  /** Between one read and the next. */
  intervalMs: number
  /** How long without a definite answer before the page says what it knows so far. */
  slowAfterMs: number
  /** How long it keeps asking. */
  giveUpAfterMs: number
}

/** The webhook usually lands before the person does; past a few seconds the page says so, and it asks for a minute. */
export const CHECK_TIMING: CheckTiming = { intervalMs: 2_000, slowAfterMs: 4_000, giveUpAfterMs: 60_000 }

interface CheckOptions {
  signal: AbortSignal
  /** Once, after slowAfterMs without a definite answer: what the last read said, still waiting or failed. */
  onSlow: (last: 'pending' | 'error') => void
  timing?: CheckTiming
  /** Milliseconds on a clock that only moves forward; a test passes its own. */
  now?: () => number
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>
}

function sleepUnlessAborted(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve()
      return
    }
    const timer = setTimeout(done, ms)
    signal.addEventListener('abort', done, { once: true })
    function done() {
      clearTimeout(timer)
      signal.removeEventListener('abort', done)
      resolve()
    }
  })
}

/**
 * Asks `read` until it answers updated, failed or none, or giveUpAfterMs passes (`unresolved`). A read that fails, or
 * answers anything else than the four states, counts as a failed read and is asked again. Resolves null once the
 * signal aborts: the page is gone, and nothing is said.
 */
export async function checkPaymentMethodUpdate(
  read: () => Promise<PaymentMethodUpdateState>,
  { signal, onSlow, timing = CHECK_TIMING, now = () => performance.now(), sleep = sleepUnlessAborted }: CheckOptions,
): Promise<PaymentMethodCheck | null> {
  const started = now()
  let slowSaid = false
  for (;;) {
    if (signal.aborted) return null
    let last: 'pending' | 'error'
    try {
      const state = await read()
      if (signal.aborted) return null
      if (state === 'updated' || state === 'failed' || state === 'none') return state
      last = state === 'pending' ? 'pending' : 'error'
    } catch {
      if (signal.aborted) return null
      last = 'error'
    }
    const elapsed = now() - started
    if (!slowSaid && elapsed >= timing.slowAfterMs) {
      slowSaid = true
      onSlow(last)
    }
    if (elapsed >= timing.giveUpAfterMs) return 'unresolved'
    await sleep(timing.intervalMs, signal)
  }
}
