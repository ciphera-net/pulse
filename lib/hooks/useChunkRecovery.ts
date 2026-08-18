'use client'

import { useEffect, useRef, useState } from 'react'
import { isChunkLoadError, recoverFromChunkFailure } from '@/lib/chunk-recovery'

export type ChunkRecoveryPhase = 'pending' | 'reloading' | 'show'

/**
 * Error-boundary side of the chunk-failure self-heal (see lib/chunk-recovery.ts for
 * the why). Returns the render phase:
 *  - 'pending'   — chunk failure detected, recovery not yet attempted (first paint);
 *  - 'reloading' — a recovery reload is in flight; render NOTHING, not an error flash;
 *  - 'show'      — not a chunk failure, or the guard blocked the reload: render the
 *                  normal visible error UI so the user keeps control.
 *
 * Shared by components/ErrorDisplay.tsx (every route boundary) and
 * app/global-error.tsx (the double-fault path) so the logic exists exactly once.
 *
 * ⚠️ The ref guard is load-bearing: React StrictMode double-invokes effects in dev,
 * and the second recoverFromChunkFailure() call would find the guard just armed,
 * return false, and overwrite 'reloading' with 'show' — flashing the error page in
 * `next dev` while the reload is genuinely in flight. Refs survive StrictMode's
 * simulated remount, so the second invocation becomes a no-op.
 */
export function useChunkRecovery(error: unknown): ChunkRecoveryPhase {
  const chunkFailure = isChunkLoadError(error)
  const [phase, setPhase] = useState<ChunkRecoveryPhase>(chunkFailure ? 'pending' : 'show')
  const attempted = useRef(false)

  useEffect(() => {
    if (!chunkFailure || attempted.current) return
    attempted.current = true
    setPhase(recoverFromChunkFailure() ? 'reloading' : 'show')
  }, [chunkFailure])

  return phase
}
