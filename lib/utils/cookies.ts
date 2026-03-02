// * Determine cookie domain dynamically.
// * In production (on ciphera.net), we share cookies across subdomains.
// * In local dev (localhost), we don't set a domain.
export const getCookieDomain = (): string | undefined => {
  if (process.env.NODE_ENV === 'production') {
    return '.ciphera.net'
  }
  return undefined
}
