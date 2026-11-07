/**
 * The crypto vectors in Chromium, Firefox and WebKit (design §8.2, review L1). Run with
 * `npm run test:crypto-vectors` (playwright.vectors.config.ts); CI runs it in .woodpecker/test.yml.
 *
 * hpke.test.ts and team-names.test.ts check the two vector files on Node's WebCrypto only. Team
 * names seal and open in the browser, and an engine difference in JWK import, HKDF, ECDH
 * deriveBits or point validation would show there while Node stays green. So this spec bundles
 * harness.ts with the production modules (lib/crypto/hpke.ts, lib/crypto/team-names.ts and
 * Tessera's vault, as they are), runs it in each engine on the same two files, and compares every
 * value the engine computed with the files, here in Node.
 *
 * The page is served by page.route on an https origin and talks to no server: WebCrypto exists
 * only in a secure context. The files' pinned SHA-256 stays with the vitest tests.
 */

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { build, type Plugin } from 'esbuild'
import { expect, test } from '@playwright/test'
import type { HarnessInput, HarnessReport, Outcome, RfcFile, TeamNamesFile } from './harness'

const ROOT = join(__dirname, '..', '..', '..', '..')
const VECTORS = join(__dirname, '..', 'vectors')
const ORIGIN = 'https://team-names-vectors.test'

const rfc: RfcFile = JSON.parse(readFileSync(join(VECTORS, 'rfc9180-subset.json'), 'utf8'))
const tn: TeamNamesFile = JSON.parse(readFileSync(join(VECTORS, 'team-names-v1.json'), 'utf8'))

/**
 * Tessera's index reaches its WASM loader, which imports the core's Node and web builds by dynamic
 * import. The vault needs WebCrypto alone and never loads the WASM, so both stay imports nobody
 * calls instead of being bundled (the Node build requires `fs`, which has no browser resolution).
 */
const tesseraWasmUnbundled: Plugin = {
  name: 'tessera-wasm-unbundled',
  setup(b) {
    b.onResolve({ filter: /\/wasm\/(node|web)\/tessera\.js$/ }, (args) => ({ path: args.path, external: true }))
  },
}

async function bundleHarness(): Promise<{ code: string; inputs: string[] }> {
  const result = await build({
    entryPoints: [join(__dirname, 'harness.ts')],
    absWorkingDir: ROOT,
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    target: 'es2020',
    metafile: true,
    logLevel: 'silent',
    plugins: [tesseraWasmUnbundled],
  })
  if (result.outputFiles.length !== 1) throw new Error(`expected one bundle, got ${result.outputFiles.length}`)
  return { code: result.outputFiles[0].text, inputs: Object.keys(result.metafile.inputs) }
}

interface EngineRun {
  version: string
  secureContext: boolean
  subtle: boolean
  bundleInputs: string[]
  report: HarnessReport
}

let engine: EngineRun | null = null

function run(): EngineRun {
  if (!engine) throw new Error('the engine run did not complete (see beforeAll)')
  return engine
}

test.beforeAll(async ({ browser }, testInfo) => {
  testInfo.setTimeout(120_000)
  const bundle = await bundleHarness()
  const context = await browser.newContext()
  try {
    const page = await context.newPage()
    const pageErrors: string[] = []
    page.on('pageerror', (err) => pageErrors.push(err.message))
    await page.route('**/*', (route) => {
      const url = new URL(route.request().url())
      if (url.origin !== ORIGIN) return route.abort()
      if (url.pathname === '/') {
        return route.fulfill({
          contentType: 'text/html; charset=utf-8',
          body: '<!doctype html><html><head><meta charset="utf-8"><title>vectors</title></head><body><script src="/harness.js"></script></body></html>',
        })
      }
      if (url.pathname === '/harness.js') return route.fulfill({ contentType: 'text/javascript; charset=utf-8', body: bundle.code })
      return route.fulfill({ status: 404, body: '' })
    })
    await page.goto(`${ORIGIN}/`)
    const env = await page.evaluate(() => ({
      secureContext: window.isSecureContext,
      subtle: typeof globalThis.crypto?.subtle?.deriveBits === 'function',
      loaded: typeof Reflect.get(globalThis, 'runTeamNamesVectors') === 'function',
    }))
    if (!env.loaded) throw new Error(`the harness did not load: ${pageErrors.join('; ') || 'no page error'}`)
    const input: HarnessInput = { rfc, teamNames: tn }
    const report: HarnessReport = await page.evaluate((arg) => Reflect.get(globalThis, 'runTeamNamesVectors')(arg), input)
    engine = { version: browser.version(), secureContext: env.secureContext, subtle: env.subtle, bundleInputs: bundle.inputs, report }
  } finally {
    await context.close()
  }
})

function value<T>(o: Outcome<T>): T {
  if (!o.ok) {
    const { name, code, message, cause } = o.error
    throw new Error(`the engine threw ${name}${code ? ` (${code})` : ''}: ${message}${cause ? `; cause ${cause}` : ''}`)
  }
  return o.value
}

function refused<T>(o: Outcome<T>, code: string) {
  expect(o).toMatchObject({ ok: false, error: { code } })
}

const sha256Hex = (h: string) => createHash('sha256').update(Buffer.from(h, 'hex')).digest('hex')

test('runs in a secure context, on WebCrypto, with the production modules bundled', ({ browserName }, testInfo) => {
  const r = run()
  testInfo.annotations.push({ type: 'engine', description: `${browserName} ${r.version}` })
  console.log(`[crypto-vectors] ${browserName} ${r.version}`)
  expect(r.secureContext).toBe(true)
  expect(r.subtle).toBe(true)
  // esbuild names its inputs relative to absWorkingDir, the repo root.
  for (const file of ['lib/crypto/hpke.ts', 'lib/crypto/team-names.ts', 'node_modules/@ciphera-net/tessera/dist/vault.js']) {
    expect(r.bundleInputs).toContain(file)
  }
  // A file that lost its entries would generate no tests below and pass by never looking.
  expect(rfc.vectors.map((v) => v.section)).toEqual(['A.3.1', 'A.3.3', 'A.6.1', 'A.6.3'])
  expect(tn.seals).toHaveLength(10)
  expect(new Set(tn.seals.map((s) => s.team_id)).size).toBe(2)
  expect(tn.identities.length).toBeGreaterThan(1)
  for (const list of [tn.open_negatives, tn.tag_negatives, tn.envelope_negatives]) expect(list.length).toBeGreaterThan(0)
})

// ---------------------------------------------------------------------------------------------
// RFC 9180 (hpke.test.ts)
// ---------------------------------------------------------------------------------------------

for (const [i, { section, vector: v }] of rfc.vectors.entries()) {
  const enc0 = v.encryptions[0]
  test.describe(`RFC 9180 ${section}`, () => {
    test('reproduces enc, shared_secret, key, base_nonce and the first ciphertext', () => {
      const r = run().report.rfc[i]
      expect(r.section).toBe(section)
      const t = value(r.seal)
      expect(t.enc).toBe(v.enc)
      expect(t.sharedSecret).toBe(v.shared_secret)
      expect(t.key).toBe(v.key)
      expect(t.keyLength).toBe(t.nk)
      expect(t.baseNonce).toBe(v.base_nonce)
      expect(t.baseNonce).toBe(enc0.nonce)
      expect(t.ct).toBe(enc0.ct)
    })

    test('opens the first ciphertext', () => {
      expect(value(run().report.rfc[i].open)).toBe(enc0.pt)
    })

    test('refuses the same ciphertext under another aad, another info, or one flipped byte', () => {
      const { refusals } = run().report.rfc[i]
      expect(refusals.map((x) => x.label)).toEqual(['another aad', 'another info', 'one flipped byte'])
      for (const x of refusals) refused(x.outcome, 'hpke/open_failed')
    })

    if (v.mode === 2) {
      test('refuses to open as base mode what was sealed in auth mode', () => {
        const { baseModeOpen } = run().report.rfc[i]
        expect(baseModeOpen).not.toBeNull()
        if (baseModeOpen) refused(baseModeOpen, 'hpke/open_failed')
      })
    }
  })
}

test('seal with a fresh ephemeral key round-trips in auth mode and never repeats an enc', () => {
  const f = value(run().report.freshSeal)
  expect(f.encs[0]).not.toBe(f.encs[1])
  expect(f.ciphertextLength).toBe(512 + 16)
  expect(f.opened).toBe(f.plaintext)
  // A different sender key in the opener's hands: the auth binding refuses it.
  expect(f.otherSender).toMatchObject({ ok: false, error: { name: 'HpkeError' } })
})

test('public keys: the uncompressed encoding of a point on the curve and nothing else', () => {
  const { valid, invalid } = run().report.publicKeys
  expect(value(valid)).toBe('public')
  expect(invalid.map((x) => x.label)).toEqual(['compressed', 'the point at infinity', 'a wrong prefix', 'a point off the curve', '65 zero bytes'])
  for (const x of invalid) {
    expect(x.outcome, x.label).toMatchObject({ ok: false, error: { name: 'HpkeError', code: 'hpke/invalid_public_key', message: 'hpke/invalid_public_key' } })
  }
})

// ---------------------------------------------------------------------------------------------
// Team names (team-names.test.ts)
// ---------------------------------------------------------------------------------------------

const byLabel = (label: string) => {
  const found = tn.identities.find((x) => x.label === label)
  if (!found) throw new Error(`no identity ${label}`)
  return found
}

for (const [i, vi] of tn.identities.entries()) {
  test(`identity ${vi.label}: the envelope opens under the vault key to 0x01 || d || pub || tag_secret`, () => {
    const r = run().report.identities[i]
    expect(r.label).toBe(vi.label)
    const pt = value(r.envelopePlaintext)
    expect(pt).toBe(vi.envelope_plaintext)
    expect(pt).toBe(`01${vi.private_key}${vi.public_key}${vi.tag_secret}`)
    expect(r.envelopeLength).toBe(219)
  })

  test(`identity ${vi.label}: the session identity carries the pub, the key id and a non-extractable key`, () => {
    const id = value(run().report.identities[i].session)
    expect(id.publicKey).toBe(vi.public_key)
    expect(id.keyId).toBe(vi.key_id)
    expect(id.keyIdOfPublicKey).toBe(vi.key_id)
    expect(id.extractable).toBe(false)
    expect(id.usages).toEqual(['deriveBits'])
  })
}

test('each envelope’s d pairs with its pub (two Diffie-Hellmans agree)', () => {
  const { ab, ba } = value(run().report.dhAgreement)
  expect(ab).toHaveLength(64)
  expect(ab).toBe(ba)
})

for (const [i, n] of tn.envelope_negatives.entries()) {
  test(`envelope negative ${i}: refuses ${n.description}`, () => {
    const r = run().report.envelopeNegatives[i]
    expect(r.description).toBe(n.description)
    expect(r.vaultOpen.ok).toBe(false)
    if (n.context === tn.identity_context) {
      expect(r.identityOpen).toMatchObject({ ok: false, error: { code: 'team_names/identity_unopenable' } })
    } else {
      expect(r.identityOpen).toBeNull()
    }
  })
}

for (const [i, s] of tn.seals.entries()) {
  test(`seal ${i} (${s.description}): info, plaintext, tag and every byte of the row`, () => {
    const r = run().report.seals[i]
    expect(r.description).toBe(s.description)
    expect(value(r.info)).toBe(s.info)
    expect(r.nameUtf8).toBe(s.name_utf8)
    expect(value(r.plaintext)).toBe(s.plaintext)
    expect(value(r.senderKeyId)).toBe(s.sender_key_id)
    expect(value(r.recipientKeyId)).toBe(s.recipient_key_id)
    const out = value(r.seal)
    expect(out.sharedSecret).toBe(s.shared_secret)
    expect(out.key).toBe(s.key)
    expect(out.baseNonce).toBe(s.base_nonce)
    expect(out.enc).toBe(s.enc)
    expect(out.sealed).toBe(s.sealed)
    expect(out.sealedLength).toBe(tn.sealed_size)
    expect(out.nameTag).toBe(s.name_tag)
    // The engine's SHA-256 of the row it built, and Node's of the row in the file.
    expect(out.sealedHash).toBe(s.sealed_hash)
    expect(sha256Hex(s.sealed)).toBe(s.sealed_hash)
    expect(value(r.tagFromSecret)).toBe(s.name_tag)
  })

  test(`seal ${i} opens for its recipient to the name`, () => {
    expect(value(run().report.seals[i].open)).toBe(s.name)
  })
}

const OPEN_NEGATIVE_CODES = {
  open_fails: 'team_names/open_failed',
  refused_version: 'team_names/unsupported_version',
  refused_length: 'team_names/malformed',
} as const

for (const [i, n] of tn.open_negatives.entries()) {
  test(`open negative ${i}: ${n.description}`, () => {
    const r = run().report.openNegatives[i]
    expect(r.label).toBe(n.description)
    if (n.outcome === 'no_name') expect(value(r.outcome)).toBeNull()
    else refused(r.outcome, OPEN_NEGATIVE_CODES[n.outcome])
  })
}

for (const [i, n] of tn.tag_negatives.entries()) {
  test(`tag negative ${i}: the tag differs for ${n.description}`, () => {
    const r = run().report.tagNegatives[i]
    expect(r.description).toBe(n.description)
    expect(sha256Hex(n.sealed)).toBe(n.sealed_hash)
    expect(value(r.tag)).toHaveLength(32)
    expect(value(r.tag)).not.toBe(tn.seals[n.row].name_tag)
  })
}

test('carries both halves of the replay a stolen session can write (review M1)', () => {
  // Found by shape, not by description: the row's own metadata over another ciphertext behind the same
  // version byte and enc (a row the server stores and nobody opens), and the row's own bytes in another team.
  const shapes = tn.tag_negatives.map((n) => {
    const row = tn.seals[n.row]
    const same = n.tag_secret === byLabel(row.sender).tag_secret && n.name === row.name && n.recipient_key_id === row.recipient_key_id
    const prefix = (h: string) => h.slice(0, 2 * (1 + 65))
    if (same && n.team_id === row.team_id && n.sealed.length === row.sealed.length && n.sealed !== row.sealed && prefix(n.sealed) === prefix(row.sealed)) return 'replaced'
    if (same && n.team_id !== row.team_id && n.sealed === row.sealed) return 'carried'
    return 'other'
  })
  expect(shapes).toContain('replaced')
  expect(shapes).toContain('carried')
  refused(run().report.tagNegatives[shapes.indexOf('replaced')].openAsRow, 'team_names/open_failed')
})

test('creating a key seals a 219-byte envelope that opens to the same key, kept non-extractable', () => {
  const c = value(run().report.createdIdentity)
  expect(c.envelopeLength).toBe(219)
  expect(c.extractable).toBe(false)
  expect(c.reopenedPublicKey).toBe(c.createdPublicKey)
  expect(c.reopenedKeyId).toBe(c.keyIdOfCreated)
  // A created key seals to and opens from another created key.
  expect(c.opened).toBe('Ada')
})
