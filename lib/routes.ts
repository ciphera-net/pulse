/**
 * Route constants shared by the edge and the app.
 *
 * 🔴 Deliberately a LEAF MODULE with no imports. `middleware.ts` runs on the
 * edge runtime, so anything it pulls in must be free of React, SWR and every
 * browser API. Keeping these as bare strings is what lets the middleware and
 * the client agree on a destination instead of each carrying its own copy.
 */

/**
 * Where `middleware.ts` sends an authenticated visitor who asks for `/`.
 *
 * The marketing homepage must stay server-rendered for crawlers, so an
 * authenticated `/` is a server-side redirect rather than a different render —
 * which means anything that lands on `/` on purpose is paying for a round trip
 * it could have skipped by naming this instead.
 */
export const AUTHED_HOME = '/sites'
