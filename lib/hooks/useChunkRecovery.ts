'use client'

import { useEffect, useRef, useState } from 'react'
import { isRecoverableCrash, recoverFromCrash } from '@/lib/chunk-recovery'

export type ChunkRecoveryPhase = 'pending' | 'reloading' | 'show'

/**
 * Error-boundary side of the wedged-tab self-heal (see lib/chunk-recovery.ts for
 * the why, including why the module is still called "chunk"). Returns the render
 * phase:
 *  - 'pending'   — recoverable failure detected, recovery not yet attempted;
 *  - 'reloading' — a recovery reload is in flight; render NOTHING, not an error flash;
 *  - 'show'      — not recoverable, or the guard blocked the reload: render the
 *                  normal visible error UI so the user keeps control.
 *
 * Shared by components/ErrorDisplay.tsx (every route boundary) and
 * app/global-error.tsx (the double-fault path) so the logic exists exactly once.
 *
 * 🔴 IT COVERS TWO FAILURE SHAPES NOW, not one. Until 09-09-2026 the predicate was
 * `isChunkLoadError`, a six-string allowlist, and anything else was painted on the
 * first frame with no attempt to recover — which is why an infinite render loop
 * (React #185) left the owner's dashboard dead every morning while the machinery
 * that would have fixed it sat one `if` away.
 *
 * ⚠️ The ref guard is load-bearing: React StrictMode double-invokes effects in dev,
 * and the second recovery call would find the guard just armed, return blocked, and
 * overwrite 'reloading' with 'show' — flashing the error page in `next dev` while
 * the reload is genuinely in flight. Refs survive StrictMode's simulated remount, so
 * the second invocation becomes a no-op.
 */
export function useChunkRecovery(error: unknown): ChunkRecoveryPhase {
  const recoverable = isRecoverableCrash(error)
  const [phase, setPhase] = useState<ChunkRecoveryPhase>(recoverable ? 'pending' : 'show')
  const attempted = useRef(false)

  useEffect(() => {
    if (!recoverable || attempted.current) return
    attempted.current = true

    const outcome = recoverFromCrash(error)
    if (outcome === 'reloading') {
      setPhase('reloading')
      return
    }

    // Show the error page rather than a blank area — the user keeps control either
    // way. But an 'offline' verdict is a temporary condition, not a refusal: a
    // laptop waking from sleep reports navigator.onLine === false for a beat while
    // Wi-Fi reassociates, which is precisely when this app is asked to recover.
    // Heal on our own when the network comes back.
    setPhase('show')
    if (outcome !== 'offline' || typeof window === 'undefined') return

    const onOnline = () => {
      if (recoverFromCrash(error) === 'reloading') setPhase('reloading')
    }
    window.addEventListener('online', onOnline, { once: true })
    return () => window.removeEventListener('online', onOnline)
  }, [recoverable, error])

  return phase
}
