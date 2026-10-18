import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// /docs used to be rewritten to a third-party documentation host that answered 404 for every path. It is now a
// permanent redirect to the product's documentation, and nothing in the config names the old host.
// The suite runs from the project root; under jsdom import.meta.url is not a file URL.
const config = readFileSync(resolve(process.cwd(), 'next.config.ts'), 'utf8')

describe('/docs', () => {
  it('sends no request to the old documentation host', () => {
    expect(config).not.toMatch(/mintlify/i)
  })

  it('redirects /docs and every path under it to docs.ciphera.net/pulse, permanently', () => {
    expect(config).toContain("{ source: '/docs', destination: 'https://docs.ciphera.net/pulse', permanent: true }")
    expect(config).toContain("{ source: '/docs/:path*', destination: 'https://docs.ciphera.net/pulse', permanent: true }")
  })
})
