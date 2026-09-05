import type { cookies } from 'next/headers'

/**
 * Pulse's OWN session cookies — the server half of per-app sessions S3.
 *
 * Until S3 Pulse wrote `access_token` / `refresh_token` / `csrf_token` on
 * `Domain=.ciphera.net`: the same three names, on the same domain, that
 * id.ciphera.net writes for its ceremony and that every `*.ciphera.net` app
 * could read. One credential for the estate. Now Pulse keeps its tokens in
 * HOST-ONLY cookies on its own origin, under its OWN NAMES, and the browser
 * sends the access token to pulse-api as `Authorization: Bearer` (the cookie
 * would never reach that host — it is a different one).
 *
 * 🔴 OWN NAMES, ON PURPOSE. Pulse's origin is under ciphera.net, so the apex
 * trio still reaches it (the ceremony writes them until S5). A shared name
 * would put `refresh_token` in the request TWICE, and `cookies().get()` would
 * return whichever the jar listed first — cookie-jar order deciding which
 * credential authenticates, which is the shape reuse detection punishes
 * (design §10.9). Two credentials that do not share a name cannot be confused.
 * Warden shipped the same shape (§10.10.2).
 *
 * 🔴 NO `domain` ATTRIBUTE, ANYWHERE IN THIS FILE, EVER. That single attribute
 * is the whole of S3. There is no helper that takes one, so the only way to
 * write an apex cookie from Pulse again is to stop using this file.
 *
 * All three are httpOnly, including the CSRF token: with a Bearer transport
 * the browser no longer needs to read it — it exists so the SERVER can sign
 * the operator out at id-backend, whose logout route demands the double-submit
 * pair by literal cookie name (see lib/auth/id-session.server.ts).
 *
 * Design: Infra/Auth/docs/plans/03-09-2026-per-app-sessions-design.md §10.11.
 */

type CookieStore = Awaited<ReturnType<typeof cookies>>

export const SESSION_COOKIE = {
  /** The 15-minute access token; also what the browser holds in memory as the Bearer. */
  access: 'pulse_access',
  /** The 30-day refresh token — Pulse's own family at id-backend. */
  refresh: 'pulse_refresh',
  /** id-backend's CSRF token for this session, for the server-side sign-out. */
  csrf: 'pulse_csrf',
} as const

export const ACCESS_TTL_S = 60 * 15
export const REFRESH_TTL_S = 60 * 60 * 24 * 30

/**
 * Host-only by construction. `secure` follows the build, as it always did here
 * (local dev runs over http). SameSite=Lax, unchanged from before S3: the
 * session begins with a top-level navigation back from id.ciphera.net and
 * must carry the cookie on arrival.
 */
function attrs(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
  }
}

export interface SessionTokens {
  access: string
  /** Only when id-backend actually rotated — see the refresh route's guard. */
  refresh?: string | null
  csrf?: string | null
}

/** Writes what is present. Never a domain. */
export function writeSession(store: CookieStore, tokens: SessionTokens): void {
  store.set(SESSION_COOKIE.access, tokens.access, attrs(ACCESS_TTL_S))
  if (tokens.refresh) store.set(SESSION_COOKIE.refresh, tokens.refresh, attrs(REFRESH_TTL_S))
  if (tokens.csrf) store.set(SESSION_COOKIE.csrf, tokens.csrf, attrs(REFRESH_TTL_S))
}

/** Expires Pulse's three cookies on this origin. The apex trio is not ours to touch. */
export function clearSession(store: CookieStore): void {
  for (const name of [SESSION_COOKIE.access, SESSION_COOKIE.refresh, SESSION_COOKIE.csrf]) {
    store.delete({ name, path: '/' })
  }
}

/** Expires the access token alone — the org-context retry keeps the refresh token. */
export function clearAccess(store: CookieStore): void {
  store.delete({ name: SESSION_COOKIE.access, path: '/' })
}

export interface SessionCookies {
  access: string | null
  refresh: string | null
  csrf: string | null
}

export function readSession(store: CookieStore): SessionCookies {
  return {
    access: store.get(SESSION_COOKIE.access)?.value ?? null,
    refresh: store.get(SESSION_COOKIE.refresh)?.value ?? null,
    csrf: store.get(SESSION_COOKIE.csrf)?.value ?? null,
  }
}
