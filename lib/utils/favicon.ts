/**
 * Same-origin favicon proxy endpoint (see app/api/favicon/route.ts).
 * Append `?domain=<host>&sz=<px>` to get a favicon (sz ∈ 16/32/64/128).
 *
 * Never point this at a third-party service directly: favicons render in the
 * authenticated app, so a third-party URL leaks every customer's referrer and
 * page domains (plus the user's IP) to that party on each dashboard view.
 *
 * Kept in a separate module so server components can import it
 * without pulling in the React-dependent icon registry.
 */
export const FAVICON_SERVICE_URL = '/api/favicon'
