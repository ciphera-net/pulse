import type { AnalystTurn } from '@/lib/api/analyst'

/**
 * Round 8 (picked 12-11-2026): an answer whose stream broke after it started. The question carries on at the server,
 * which keeps the turn under the id the stream's `start` named, so the page reads that turn until it is kept.
 *
 * Measured 12-11-2026: a 45 s answer was kept whole at the server while the browser's side of the stream ended before
 * `done`, and the page said "Something went wrong" over an answer that existed.
 */

/** How often the page reads the turn while it waits. */
export const RECOVERY_EVERY_MS = 3_000

/**
 * How long after the question the page stops waiting: the server stops a question at 150 s and writes its follow-up
 * questions in up to 6 s more, so a turn not kept by then never will be.
 */
export const RECOVERY_LIMIT_MS = 180_000

/** How long one read may take before the page gives up on it and reads again. */
export const RECOVERY_READ_MS = 10_000

/**
 * Reads the turn now, then every `every` ms, until `read` returns it or Date.now() passes `until`. Null when it was not
 * kept by then, or when the question was stopped. A read that fails or takes longer than RECOVERY_READ_MS (the network
 * still down) is tried again, as a turn not kept yet is.
 */
export async function waitForTurn(
  read: (signal: AbortSignal) => Promise<AnalystTurn | null>,
  until: number,
  signal: AbortSignal,
  every = RECOVERY_EVERY_MS,
): Promise<AnalystTurn | null> {
  for (;;) {
    if (signal.aborted) return null
    try {
      const turn = await readOnce(read, signal)
      if (turn) return turn
    } catch {
      // * Read again below.
    }
    const left = until - Date.now()
    if (left <= 0 || signal.aborted) return null
    await pause(Math.min(every, left), signal)
  }
}

/** One read, ended by the question's stop or after RECOVERY_READ_MS, whichever comes first. */
async function readOnce(read: (signal: AbortSignal) => Promise<AnalystTurn | null>, stop: AbortSignal) {
  const ctrl = new AbortController()
  const end = () => ctrl.abort()
  const timer = setTimeout(end, RECOVERY_READ_MS)
  stop.addEventListener('abort', end)
  try {
    return await read(ctrl.signal)
  } finally {
    clearTimeout(timer)
    stop.removeEventListener('abort', end)
  }
}

/** Waits ms, or less when the question is stopped. */
function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', done)
      resolve()
    }
    const timer = setTimeout(done, ms)
    signal.addEventListener('abort', done)
  })
}
