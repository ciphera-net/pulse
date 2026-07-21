import type { Page, ConsoleMessage } from '@playwright/test'

/**
 * Console-error collector for the read-only smoke suite.
 *
 * Attaches a `console` + `pageerror` listener and records every error-level
 * message, EXCEPT the single documented benign case: the favicon-resolver 404
 * for id.ciphera.net. Pulse proxies favicons through a same-origin endpoint
 * (`/api/favicon`, backed by the self-hosted Sigil resolver); id.ciphera.net
 * has no resolvable favicon, so the referrer/brand row for it surfaces a
 * benign 404. This is called out in the 18-07-2026 settings-redesign handoffs
 * and is the ONLY allowlisted error — nothing else is swallowed.
 */

const BENIGN_PATTERNS: RegExp[] = [
  // Same-origin favicon proxy endpoint returning 404 (Sigil resolver miss).
  /\/api\/favicon/i,
  // The favicon-resolver 404 for id.ciphera.net specifically.
  /favicon[^]*id\.ciphera\.net/i,
  /id\.ciphera\.net[^]*favicon/i,
]

function isBenign(msg: ConsoleMessage): boolean {
  const text = msg.text()
  const url = msg.location()?.url ?? ''
  return BENIGN_PATTERNS.some((re) => re.test(text) || re.test(url))
}

export interface ConsoleErrorCollector {
  /** All non-benign error-level messages captured so far. */
  errors: string[]
}

export function collectConsoleErrors(page: Page): ConsoleErrorCollector {
  const collector: ConsoleErrorCollector = { errors: [] }

  page.on('console', (msg) => {
    if (msg.type() !== 'error') return
    if (isBenign(msg)) return
    const loc = msg.location()
    const where = loc?.url ? ` (${loc.url}:${loc.lineNumber})` : ''
    collector.errors.push(`[console.error] ${msg.text()}${where}`)
  })

  // Uncaught exceptions surface as pageerror, not console — capture both.
  page.on('pageerror', (err) => {
    collector.errors.push(`[pageerror] ${err.message}`)
  })

  return collector
}
