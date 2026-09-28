// The gate-6 staging harness's entry (design §3.12b, gate 6). Test support:
// nothing in the app imports it and it is never shipped.
//
// There is no import UI until M11, so gate 6 drives the library from a script
// injected into a LOGGED-IN pulse-staging page, with the REAL prebuilt
// /workers/import.js served by that page's own origin. Bundle this file into
// one classic script:
//
//   npx esbuild lib/import/__tests__/support/harness-entry.ts --bundle \
//     --format=iife --platform=browser --target=es2020 --outfile=<scratch>/import-harness.js
//
// inject it (Playwright `page.addScriptTag({ path })`, or `page.evaluate` of its
// text), and it exposes `window.PulseImportHarness`. The transport here is the
// harness's own: it sends a bearer token and CSRF token the harness captured,
// because the app's `apiRequest` keeps its token in a module variable no
// injected script can reach.

import {
  DEFAULT_WORKER_URL,
  ImportError,
  deleteImport,
  getImportStatus,
  getUploadWindow,
  prepareImport,
  runImport,
  type Transport,
} from '../../index'
import { FATHOM_FIXTURE_RANGE, fathomFixtureFiles } from '../fixtures/fathom-export'
import { FIXTURE_RANGE, plausibleFixtureFile, plausibleFixtureZip } from '../fixtures/plausible-export'
import { UMAMI_FIXTURE_RANGE, umamiFixtureCsv, umamiFixtureFile } from '../fixtures/umami-export'

export interface FetchTransportOptions {
  /** The API origin, e.g. the staging API; requests go to `${apiBase}/api/v1${path}`. */
  apiBase: string
  /** Returns the current bearer token (re-read on every request, so the harness can refresh it). */
  token: () => string
  /** Returns the CSRF token for writes (the page's `csrf_token` cookie). */
  csrf: () => string | null
}

/** A plain-fetch transport carrying a captured session. Resolves every HTTP answer; status 0 when none came. */
export function fetchTransport(options: FetchTransportOptions): Transport {
  return async (req) => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${options.token()}`,
    }
    const csrf = options.csrf()
    if (req.method !== 'GET' && csrf) headers['X-CSRF-Token'] = csrf
    let res: Response
    try {
      res = await fetch(`${options.apiBase}/api/v1${req.path}`, {
        method: req.method,
        headers,
        body: req.body ?? undefined,
        credentials: 'include',
        signal: req.signal,
      })
    } catch {
      return { status: 0, body: null, retryAfterSeconds: null }
    }
    const text = await res.text().catch(() => '')
    let body: unknown = null
    if (text) {
      try {
        body = JSON.parse(text)
      } catch {
        // A non-JSON answer (an edge error page) keeps its status; the client names it by status.
        body = null
      }
    }
    const retryAfter = Number(res.headers.get('Retry-After'))
    return { status: res.status, body, retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null }
  }
}

/** Reads a cookie the page can see (the CSRF token is deliberately not httpOnly). */
export function readCookie(name: string): string | null {
  for (const part of document.cookie.split(';')) {
    const [k, v] = part.trim().split('=')
    if (k === name) return decodeURIComponent(v ?? '')
  }
  return null
}

/** SHA-256 (hex) of what this origin serves at `path`: gate 6 compares it with the build's bytes. */
export async function servedSha256(path: string = DEFAULT_WORKER_URL): Promise<string> {
  const bytes = await (await fetch(path, { cache: 'no-store' })).arrayBuffer()
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('')
}

const harness = {
  DEFAULT_WORKER_URL,
  FIXTURE_RANGE,
  // The synthetic Fathom export (M7 gate 7), for a run against a build with
  // Fathom registered: it is not registered in any shipped build (M7-o).
  FATHOM_FIXTURE_RANGE,
  ImportError,
  deleteImport,
  fathomFixtureFiles,
  fetchTransport,
  getImportStatus,
  getUploadWindow,
  plausibleFixtureFile,
  plausibleFixtureZip,
  prepareImport,
  readCookie,
  runImport,
  servedSha256,
  // The synthetic Umami export (M8 gate 3), for the live contract run and
  // staging: Umami is registered, so any build with M8 in it takes it.
  UMAMI_FIXTURE_RANGE,
  umamiFixtureCsv,
  umamiFixtureFile,
}

;(globalThis as { PulseImportHarness?: typeof harness }).PulseImportHarness = harness
