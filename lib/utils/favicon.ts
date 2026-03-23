/**
 * Google's public favicon service base URL.
 * Append `?domain=<host>&sz=<px>` to get a favicon.
 *
 * Kept in a separate module so server components can import it
 * without pulling in the React-dependent icon registry.
 */
export const FAVICON_SERVICE_URL = 'https://www.google.com/s2/favicons'
