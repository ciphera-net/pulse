'use client'

import { logger } from '@/lib/utils/logger'

/**
 * The one slot that says "after signing in, go HERE instead".
 *
 * 🔴 WHY THIS IS A MODULE AND NOT A `localStorage.setItem` CALL. Four places
 * wrote this key by hand and the auth callback read it by hand, and what it
 * holds **outranks the destination the callback resolves** — deliberately: an
 * invite or a deep link is an explicit request, and the callback does not know
 * better. But the value had **no expiry and no binding to the sign-in that
 * wrote it**, so a target written days ago by an unrelated visit still won the
 * next sign-in, exactly once, and then vanished on read.
 *
 * That is precisely the shape of the 09-09-2026 report (audit §4n): the owner
 * signed in from the installed PWA and landed in the setup wizard on an account
 * whose workspace finished onboarding in April. Every other path was ruled out
 * by measurement — the completion flag is set and its read is uncached, the
 * account owns one workspace so `ensure-default` answered `created:false`, both
 * pods predated the sign-in, and there is no service worker. It could not be
 * reproduced afterwards, because clearing site data had already consumed the
 * evidence along with the value.
 *
 * So the slot gets a timestamp and a lifetime, and every caller goes through
 * here. A stored target older than {@link RETURN_TARGET_TTL_MS} is not a
 * request any more, it is a leftover.
 */

const KEY = 'pulse_auth_return_to'

/**
 * How long a return target stays meaningful.
 *
 * Ten minutes: long enough for the whole OAuth round trip including a password,
 * a 2FA code and a slow inbox, and short enough that a target cannot survive
 * into an unrelated sign-in later the same day. It is deliberately NOT the
 * session lifetime — this value describes one journey, not one login.
 */
export const RETURN_TARGET_TTL_MS = 10 * 60 * 1000

interface StoredTarget {
  target: string
  /** ms since epoch, from the writer's clock. */
  at: number
}

function isStored(v: unknown): v is StoredTarget {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return typeof o.target === 'string' && o.target !== '' && typeof o.at === 'number'
}

/** Remember where this sign-in should land. Safe to call when storage is blocked. */
export function rememberReturnTarget(target: string): void {
  if (typeof window === 'undefined' || !target) return
  try {
    localStorage.setItem(KEY, JSON.stringify({ target, at: Date.now() } satisfies StoredTarget))
  } catch {
    // Storage unavailable (private window, blocked site data). Losing the target
    // costs a landing on the default destination — never a failed sign-in.
  }
}

/**
 * Read the target WITHOUT consuming it.
 *
 * The callback needs this before it decides whether to provision a workspace —
 * somebody on their way to `/join` must not be handed a stray one of their own —
 * and that read must not spend the value the landing step still needs.
 */
export function peekReturnTarget(): string | null {
  if (typeof window === 'undefined') return null
  let raw: string | null = null
  try {
    raw = localStorage.getItem(KEY)
  } catch {
    return null
  }
  if (!raw) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    // ⚠️ A BARE STRING IS A VALUE WRITTEN BY THE PREVIOUS BUILD, and it is
    // honoured. It carries no timestamp, so in-flight and stale are
    // indistinguishable — and of those two, dropping it is the worse mistake:
    // it would strand somebody mid-invite across a deploy, on the one path
    // (`/join`) where the target is the whole point. It is one-shot either way,
    // so the window is a single sign-in per browser and then it is gone.
    return raw
  }

  if (!isStored(parsed)) {
    forgetReturnTarget()
    return null
  }
  const age = Date.now() - parsed.at
  // A negative age means the writer's clock is ahead of ours — a real thing on
  // a machine whose time just synced. Treat it as fresh rather than expired:
  // the value was written by this browser, for this journey.
  if (age > RETURN_TARGET_TTL_MS) {
    logger.warn('Discarding a stale sign-in return target', { ageMs: age })
    forgetReturnTarget()
    return null
  }
  return parsed.target
}

/** Read it and spend it. Returns null when there was nothing live to spend. */
export function claimReturnTarget(): string | null {
  const target = peekReturnTarget()
  forgetReturnTarget()
  return target
}

export function forgetReturnTarget(): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(KEY)
  } catch {
    // Nothing to do — a value we cannot remove is one we also could not read.
  }
}
