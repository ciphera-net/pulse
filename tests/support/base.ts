import type { BrowserContextOptions } from '@playwright/test'

/**
 * The one origin the authed smoke suite drives, and the certificate it presents there.
 *
 * Staging is a SINGLE origin behind an access proxy. The pages, the backend's API paths
 * (/api/v1, /api/billing, /api/audit) and the sign-in callback all live on it, and the proxy
 * admits a browser that presents an application certificate for it. So there is one base URL to
 * set and one certificate to hand over, and both come from the environment. Nothing is committed.
 *
 *   SMOKE_BASE_URL     the origin under test (default: the staging app)
 *   SMOKE_CLIENT_CERT  path to a PEM certificate the proxy accepts for that origin
 *   SMOKE_CLIENT_KEY   path to its PEM private key
 *
 * Playwright matches a certificate to an EXACT origin. The entry built here is for BASE_URL's
 * origin and no other, so a run aimed at localhost or at production presents nothing there.
 *
 * Contexts a spec builds for itself (browser.newContext(), request.newContext()) need no extra
 * wiring: the runner fills every option the spec leaves out from the project's `use` block,
 * clientCertificates included (playwright/lib/index.js, runBeforeCreateBrowserContext and
 * runBeforeCreateRequestContext, read on 1.59.1).
 */

export const DEFAULT_BASE_URL = 'https://pulse-staging.teleport.ciphera.net'

/** The origin under test: SMOKE_BASE_URL, else the staging app. */
export const BASE_URL = process.env.SMOKE_BASE_URL ?? DEFAULT_BASE_URL

/**
 * The access proxy's own host. A page served from here, where the app was asked for, means the
 * request was NOT admitted: the proxy answered with its sign-in instead of passing it on.
 */
export const ACCESS_PROXY_HOST = 'teleport.ciphera.net'

type ClientCertificate = NonNullable<BrowserContextOptions['clientCertificates']>[number]

/**
 * `use.clientCertificates` for the origin under test, or undefined when none is configured.
 *
 * Both paths or neither: one of the two set is a half-configured run that would otherwise fall
 * through to the proxy's sign-in page and fail somewhere unrelated, so it stops here instead.
 */
export function clientCertificates(
  env: Record<string, string | undefined> = process.env,
  baseUrl: string = BASE_URL,
): ClientCertificate[] | undefined {
  const certPath = env['SMOKE_CLIENT_CERT']
  const keyPath = env['SMOKE_CLIENT_KEY']
  if (!certPath && !keyPath) return undefined
  if (!certPath || !keyPath) {
    throw new Error('SMOKE_CLIENT_CERT and SMOKE_CLIENT_KEY go together: set both (PEM file paths) or neither.')
  }
  return [{ origin: new URL(baseUrl).origin, certPath, keyPath }]
}

/** True when `url` is a page of the access proxy itself rather than of the app behind it. */
export function onAccessProxy(url: string): boolean {
  try {
    return new URL(url).hostname === ACCESS_PROXY_HOST
  } catch {
    return false
  }
}
