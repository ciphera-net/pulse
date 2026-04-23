const BLOCKED_PATTERNS = [
  /^\/\//,           // protocol-relative: //evil.com
  /^\/\\/,           // backslash: /\evil.com (some browsers normalize to //)
  /[/\\][/\\]/,      // double separator anywhere: http://evil.com encoded as path
  /:\/\//,           // absolute URL embedded: javascript://... or https://...
  /[\x00-\x1f]/,     // control characters including null bytes
  /^[a-z]+:/i,       // any protocol scheme: javascript:, data:, vbscript:
]

/**
 * Validate a redirect URL to prevent open redirect attacks.
 * Only allows relative paths starting with /. Returns fallback on any violation.
 */
export function safeRedirectUrl(url: unknown, fallback = '/'): string {
  if (typeof url !== 'string' || !url) return fallback

  const decoded = decodeURIComponent(url)

  if (!decoded.startsWith('/')) return fallback

  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(decoded)) return fallback
  }

  // Double-decode to catch %252F%252F → %2F%2F → //
  try {
    const doubleDecoded = decodeURIComponent(decoded)
    if (doubleDecoded !== decoded) {
      for (const pattern of BLOCKED_PATTERNS) {
        if (pattern.test(doubleDecoded)) return fallback
      }
    }
  } catch {
    // malformed encoding — reject
    return fallback
  }

  return url
}
