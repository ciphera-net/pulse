/**
 * Dev-only logger that suppresses client-side output in production.
 * Server-side logs always pass through (they go to server logs, not the browser).
 */

const isServer = typeof window === 'undefined'
const isDev = process.env.NODE_ENV === 'development'

export const logger = {
  error(...args: unknown[]) {
    if (isServer || isDev) console.error(...args)
  },
  warn(...args: unknown[]) {
    if (isServer || isDev) console.warn(...args)
  },
}
