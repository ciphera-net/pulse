/**
 * The crypto vectors in Chromium, Firefox and WebKit (design §8.2, review L1). Run with
 * `npm run test:crypto-vectors` (playwright.vectors.config.ts); CI runs it in .woodpecker/test.yml.
 *
 * hpke.test.ts, team-names.test.ts, team-emails.test.ts and vault-proof.test.ts check the four
 * vector files on Node's WebCrypto only. Team names and members' addresses seal and open in the
 * browser, and the vault-key proof signs there (design §17), and an engine difference in JWK import,
 * HKDF, ECDH deriveBits, ECDSA, point validation or a Unicode property escape would show there while
 * Node stays green. So this spec bundles harness.ts with the production modules (lib/crypto/hpke.ts,
 * lib/crypto/team-names.ts, Tessera's vault and @ciphera-net/auth's vault-proof entry, as they are),
 * runs it in each engine on the same four files, and compares every value the engine computed with
 * the files, here in Node. What an engine made rather than computed (an envelope, a signature) is
 * opened and verified here with Node's own primitives.
 *
 * The page is served by page.route on an https origin and talks to no server: WebCrypto exists
 * only in a secure context. The files' pinned SHA-256 stays with the vitest tests.
 */

import { createDecipheriv, createHash, createPublicKey, hkdfSync, verify as nodeVerify } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { build, type Plugin } from 'esbuild'
import { expect, test } from '@playwright/test'
import type { HarnessInput, HarnessReport, Outcome, RfcFile, TeamEmailsFile, TeamNamesFile, VaultProofFile } from './harness'

const ROOT = join(__dirname, '..', '..', '..', '..')
const VECTORS = join(__dirname, '..', 'vectors')
const ORIGIN = 'https://team-names-vectors.test'

const rfc: RfcFile = JSON.parse(readFileSync(join(VECTORS, 'rfc9180-subset.json'), 'utf8'))
const tn: TeamNamesFile = JSON.parse(readFileSync(join(VECTORS, 'team-names-v1.json'), 'utf8'))
const te: TeamEmailsFile = JSON.parse(readFileSync(join(VECTORS, 'team-emails-v1.json'), 'utf8'))
const vp: VaultProofFile = JSON.parse(readFileSync(join(VECTORS, 'vault-proof-v1.json'), 'utf8'))

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
    const input: HarnessInput = { rfc, teamNames: tn, teamEmails: te, vaultProof: vp }
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
  for (const file of [
    'lib/crypto/hpke.ts',
    'lib/crypto/team-names.ts',
    'node_modules/@ciphera-net/tessera/dist/vault.js',
    'node_modules/@ciphera-net/auth/dist/vault-proof.js',
  ]) {
    expect(r.bundleInputs).toContain(file)
  }
  // A file that lost its entries would generate no tests below and pass by never looking.
  expect(rfc.vectors.map((v) => v.section)).toEqual(['A.3.1', 'A.3.3', 'A.6.1', 'A.6.3'])
  expect(tn.seals).toHaveLength(10)
  expect(new Set(tn.seals.map((s) => s.team_id)).size).toBe(2)
  expect(tn.identities.length).toBeGreaterThan(1)
  for (const list of [tn.open_negatives, tn.tag_negatives, tn.envelope_negatives]) expect(list.length).toBeGreaterThan(0)
  expect(te.seals).toHaveLength(12)
  expect(new Set(te.seals.map((s) => s.team_id)).size).toBe(2)
  expect(te.identities.length).toBeGreaterThan(1)
  expect(te.address_negatives).toHaveLength(14)
  expect(te.cross_kind_negatives.map((n) => `${n.sealed_as}>${n.open_as}`).sort()).toEqual(['email>name', 'name>email'])
  for (const list of [te.open_negatives, te.tag_negatives, te.envelope_negatives]) expect(list.length).toBeGreaterThan(0)
  expect(vp.version).toBe('vault-proof-v1')
  for (const field of [vp.envelope_hex, vp.plaintext_hex, vp.message_hex, vp.signature_go_hex, vp.inputs._rfc6979_control.r_hex]) {
    expect(field.length).toBeGreaterThan(0)
  }
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
      for (const x of refusals) expect.soft(x.outcome, x.label).toMatchObject({ ok: false, error: { code: 'hpke/open_failed' } })
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
  expect(valid.map((x) => x.label)).toEqual(['the vector key', 'the point (0, y0)', 'P-521, the point (0, y0)'])
  for (const x of valid) expect.soft(x.outcome, x.label).toEqual({ ok: true, value: 'public' })
  expect(invalid.map((x) => x.label)).toEqual([
    'compressed',
    'the point at infinity',
    'a wrong prefix',
    'a point off the curve',
    '65 zero bytes',
    'x changed',
    '(0, 0)',
    'x = p',
    'both coordinates 2^256 - 1',
    'P-521, y changed',
    'P-521, x = p',
  ])
  // Soft, so a failure lists every point the engine took, not the first.
  for (const x of invalid) {
    expect.soft(x.outcome, x.label).toMatchObject({ ok: false, error: { name: 'HpkeError', code: 'hpke/invalid_public_key', message: 'hpke/invalid_public_key' } })
  }
})

test('public keys outside HPKE (importEcdhPublicKey, the relay key): the same points, the same answers', () => {
  const { valid, invalid, ecdhValid, ecdhInvalid } = run().report.publicKeys
  expect(ecdhValid.map((x) => x.label)).toEqual(valid.map((x) => x.label))
  expect(ecdhInvalid.map((x) => x.label)).toEqual(invalid.map((x) => x.label))
  for (const x of ecdhValid) expect.soft(x.outcome, x.label).toEqual({ ok: true, value: 'public' })
  for (const x of ecdhInvalid) {
    expect.soft(x.outcome, x.label).toMatchObject({ ok: false, error: { name: 'HpkeError', code: 'hpke/invalid_public_key', message: 'hpke/invalid_public_key' } })
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

// ---------------------------------------------------------------------------------------------
// Team emails (team-emails.test.ts)
// ---------------------------------------------------------------------------------------------

const emailByLabel = (label: string) => {
  const found = te.identities.find((x) => x.label === label)
  if (!found) throw new Error(`no identity ${label}`)
  return found
}

for (const [i, vi] of te.identities.entries()) {
  test(`emails identity ${vi.label}: the envelope opens to 0x01 || d || pub || tag_secret, and the session key is non-extractable`, () => {
    const r = run().report.emails.identities[i]
    expect(r.label).toBe(vi.label)
    expect(value(r.envelopePlaintext)).toBe(`01${vi.private_key}${vi.public_key}${vi.tag_secret}`)
    expect(r.envelopeLength).toBe(219)
    const id = value(r.session)
    expect([id.publicKey, id.keyId, id.keyIdOfPublicKey]).toEqual([vi.public_key, vi.key_id, vi.key_id])
    expect(id.extractable).toBe(false)
    expect(id.usages).toEqual(['deriveBits'])
  })
}

for (const [i, n] of te.envelope_negatives.entries()) {
  test(`emails envelope negative ${i}: refuses ${n.description}`, () => {
    const r = run().report.emails.envelopeNegatives[i]
    expect(r.description).toBe(n.description)
    expect(r.vaultOpen.ok).toBe(false)
    if (n.context === te.identity_context) expect(r.identityOpen).toMatchObject({ ok: false, error: { code: 'team_names/identity_unopenable' } })
    else expect(r.identityOpen).toBeNull()
  })
}

for (const [i, s] of te.seals.entries()) {
  test(`email seal ${i} (${s.description}): info, plaintext, tag and every byte of the row`, () => {
    const r = run().report.emails.seals[i]
    expect(r.description).toBe(s.description)
    expect(value(r.info)).toBe(s.info)
    expect(r.emailUtf8).toBe(s.email_utf8)
    expect(value(r.check)).toBe(s.email)
    expect(value(r.plaintext)).toBe(s.plaintext)
    expect(value(r.senderKeyId)).toBe(s.sender_key_id)
    expect(value(r.recipientKeyId)).toBe(s.recipient_key_id)
    const out = value(r.seal)
    expect(out.sharedSecret).toBe(s.shared_secret)
    expect(out.key).toBe(s.key)
    expect(out.baseNonce).toBe(s.base_nonce)
    expect(out.enc).toBe(s.enc)
    expect(out.sealed).toBe(s.sealed)
    expect(out.sealedLength).toBe(te.sealed_size)
    expect(out.emailTag).toBe(s.email_tag)
    // The engine's SHA-256 of the row it built, and Node's of the row in the file.
    expect(out.sealedHash).toBe(s.sealed_hash)
    expect(sha256Hex(s.sealed)).toBe(s.sealed_hash)
    expect(value(r.tagFromSecret)).toBe(s.email_tag)
  })

  test(`email seal ${i} opens for its recipient to the address exactly`, () => {
    expect(value(run().report.emails.seals[i].open)).toBe(s.email)
  })
}

const EMAIL_OPEN_NEGATIVE_CODES = {
  open_fails: 'team_names/open_failed',
  refused_version: 'team_names/unsupported_version',
  refused_length: 'team_names/malformed',
} as const

for (const [i, n] of te.open_negatives.entries()) {
  test(`email open negative ${i}: ${n.description}`, () => {
    const r = run().report.emails.openNegatives[i]
    expect(r.label).toBe(n.description)
    if (n.outcome === 'no_email') expect(value(r.outcome)).toBeNull()
    else refused(r.outcome, EMAIL_OPEN_NEGATIVE_CODES[n.outcome])
  })
}

for (const [i, n] of te.address_negatives.entries()) {
  test(`address negative ${i} (${n.description}): the sealer refuses it and the opener shows nothing`, () => {
    const r = run().report.emails.addressNegatives[i]
    expect(r.description).toBe(n.description)
    expect(r.emailUtf8).toBe(n.email_utf8)
    expect(value(r.check)).toBeNull()
    refused(r.seal, 'team_names/email_unsealable')
    expect(value(r.open)).toBeNull()
  })
}

for (const [i, n] of te.cross_kind_negatives.entries()) {
  test(`cross-kind negative ${i}: ${n.description}`, () => {
    const r = run().report.emails.crossKind[i]
    expect(r.description).toBe(n.description)
    // Its own kind opens it to the value, so the refusal is the label's and not a broken row.
    expect(value(r.asSealed)).toBe(n.value)
    refused(r.asOpened, 'team_names/open_failed')
  })
}

for (const [i, n] of te.tag_negatives.entries()) {
  test(`email tag negative ${i}: the tag differs for ${n.description}`, () => {
    const r = run().report.emails.tagNegatives[i]
    expect(r.description).toBe(n.description)
    expect(sha256Hex(n.sealed)).toBe(n.sealed_hash)
    expect(value(r.tag)).toHaveLength(32)
    expect(value(r.tag)).not.toBe(te.seals[n.row].email_tag)
  })
}

test('email rows: both halves of the replay a stolen session can write (review M1)', () => {
  const shapes = te.tag_negatives.map((n) => {
    const row = te.seals[n.row]
    const same = n.tag_secret === emailByLabel(row.sender).tag_secret && n.email === row.email && n.recipient_key_id === row.recipient_key_id
    const prefix = (h: string) => h.slice(0, 2 * (1 + 65))
    if (same && n.team_id === row.team_id && n.sealed.length === row.sealed.length && n.sealed !== row.sealed && prefix(n.sealed) === prefix(row.sealed)) return 'replaced'
    if (same && n.team_id !== row.team_id && n.sealed === row.sealed) return 'carried'
    return 'other'
  })
  expect(shapes).toContain('replaced')
  expect(shapes).toContain('carried')
  refused(run().report.emails.tagNegatives[shapes.indexOf('replaced')].openAsRow, 'team_names/open_failed')
})

test('the address check reads this engine’s Unicode tables as the design reads them', () => {
  const { accepted, refused: refusedCases } = run().report.emails.checkCases
  expect(accepted.length).toBeGreaterThan(0)
  expect(refusedCases.length).toBeGreaterThan(0)
  // Soft, so a failure lists every case the engine got wrong, not the first.
  for (const c of accepted) expect.soft(c.outcome, `accepted: ${c.label}`).toEqual({ ok: true, value: true })
  for (const c of refusedCases) expect.soft(c.outcome, `refused: ${c.label}`).toEqual({ ok: true, value: false })
})

test('sealEmail with a fresh ephemeral key round-trips, never repeats an enc, and no row opens as the other kind', () => {
  const f = value(run().report.emails.fresh)
  expect(f.encs[0]).not.toBe(f.encs[1])
  expect(f.sealedLength).toBe(te.sealed_size)
  expect(f.opened).toBe('Ada.Lovelace@Example.COM')
  refused(f.asName, 'team_names/open_failed')
  expect(f.nameRowAsName).toBe('Ada.Lovelace@Example.COM')
  refused(f.nameRowAsEmail, 'team_names/open_failed')
})

// ---------------------------------------------------------------------------------------------
// The vault-key proof (vault-proof.test.ts)
// ---------------------------------------------------------------------------------------------

/** Tessera's record envelope v1 opened with Node's own HKDF and AES-GCM: an opener that shares no code with the engine's. */
function openRecordEnvelope(vmkHex: string, context: string, envelopeHex: string): string {
  const envelope = Buffer.from(envelopeHex, 'hex')
  if (envelope[0] !== 0x01) throw new Error('not a version 1 envelope')
  const aad = Buffer.concat([Buffer.from([0x01]), Buffer.from(context, 'utf8')])
  const kek = Buffer.from(hkdfSync('sha256', Buffer.from(vmkHex, 'hex'), Buffer.alloc(32), Buffer.from(`tessera/vault/v1/record/${context}`, 'utf8'), 32))
  const open = (key: Buffer, nonce: Buffer, sealed: Buffer) => {
    const gcm = createDecipheriv('aes-256-gcm', key, nonce)
    gcm.setAAD(aad)
    gcm.setAuthTag(sealed.subarray(sealed.length - 16))
    return Buffer.concat([gcm.update(sealed.subarray(0, sealed.length - 16)), gcm.final()])
  }
  // [0x01][nonce 12][the data key sealed under the KEK, 48][nonce 12][the plaintext sealed under the data key]
  const dataKey = open(kek, envelope.subarray(1, 13), envelope.subarray(13, 61))
  return open(dataKey, envelope.subarray(61, 73), envelope.subarray(73)).toString('hex')
}

/** An r || s signature checked with Node's own ECDSA against the raw point. */
function nodeVerifies(publicKeyHex: string, signatureHex: string, messageHex: string): boolean {
  const pub = Buffer.from(publicKeyHex, 'hex')
  const key = createPublicKey({
    key: { kty: 'EC', crv: 'P-256', x: pub.subarray(1, 33).toString('base64url'), y: pub.subarray(33).toString('base64url') },
    format: 'jwk',
  })
  return nodeVerify('sha256', Buffer.from(messageHex, 'hex'), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(signatureHex, 'hex'))
}

test('vault proof: the Go envelope opens under the vault key and the proof context to 0x01 || d || pub', () => {
  expect(value(run().report.vaultProof.envelopePlaintext)).toBe(vp.plaintext_hex)
  expect(vp.plaintext_hex).toBe(`01${vp.inputs.proof_d_hex}${vp.inputs.proof_pub_hex}`)
})

test('vault proof: the message, byte for byte', () => {
  expect(value(run().report.vaultProof.message)).toBe(vp.message_hex)
})

test('vault proof: the Go signature and RFC 6979 A.2.5\'s signature verify under the vector key', () => {
  const r = run().report.vaultProof
  expect(value(r.goSignature)).toBe(true)
  expect(value(r.rfc6979)).toBe(true)
  // The same two in Node, so a verify path that answers true for anything would not pass here.
  expect(nodeVerifies(vp.inputs.proof_pub_hex, vp.signature_go_hex, vp.message_hex)).toBe(true)
  expect(nodeVerifies(vp.inputs.proof_pub_hex, vp.signature_go_hex, `${vp.message_hex.slice(0, -2)}00`)).toBe(false)
})

test('vault proof: a signature this engine makes with the Go envelope verifies here and in Node', () => {
  const s = value(run().report.vaultProof.signed)
  expect(s.signature).toHaveLength(2 * 64)
  expect(s.verifies).toBe(true)
  expect(nodeVerifies(vp.inputs.proof_pub_hex, s.signature, vp.message_hex)).toBe(true)
})

test('vault proof: an envelope this engine seals opens again here and with Node\'s own HKDF and AES-GCM', () => {
  const s = value(run().report.vaultProof.sealed)
  expect(s.envelope).toHaveLength(2 * 187)
  expect(s.envelope.slice(0, 2)).toBe('01')
  expect(s.reopened).toBe(vp.plaintext_hex)
  expect(openRecordEnvelope(vp.inputs.vmk_hex, vp.inputs.context, s.envelope)).toBe(vp.plaintext_hex)
  // The same opener on the Go envelope, so it is the record envelope it reads and not only this engine's output.
  expect(openRecordEnvelope(vp.inputs.vmk_hex, vp.inputs.context, vp.envelope_hex)).toBe(vp.plaintext_hex)
})

test('vault proof: a key made here signs for its own public key and for no other', () => {
  expect(value(run().report.vaultProof.created)).toEqual({ publicKeyLength: 65, envelopeLength: 187, verifiesUnderItsKey: true, verifiesUnderVectorKey: false })
})

test('vault proof: every negative refuses', () => {
  const { negatives } = run().report.vaultProof
  expect(negatives.map((n) => n.label)).toEqual([
    'a team-key envelope under the proof context',
    'the proof envelope under the team-key context',
    'the proof key sealed under the team-key context, signed as a proof key',
    'another vault key',
    'a served public key that is not the sealed one',
    'the Go signature, one byte of the prefix flipped',
    'the Go signature, one byte of the separator flipped',
    'the Go signature, one byte of the challenge flipped',
    'the Go signature, one byte of the user id flipped',
    'the Go signature, one byte of the purpose flipped',
    'the Go signature over the message of another purpose',
  ])
  const [teamUnderProof, proofUnderTeam, wrongContext, wrongVault, wrongKey, ...verifies] = negatives
  // Soft, so a failure lists every negative the engine took, not the first.
  expect.soft(teamUnderProof.outcome, teamUnderProof.label).toMatchObject({ ok: false })
  expect.soft(proofUnderTeam.outcome, proofUnderTeam.label).toMatchObject({ ok: false })
  expect.soft(wrongContext.outcome, wrongContext.label).toMatchObject({ ok: false, error: { name: 'ProofKeyUnopenableError' } })
  expect.soft(wrongVault.outcome, wrongVault.label).toMatchObject({ ok: false, error: { name: 'ProofKeyUnopenableError' } })
  expect.soft(wrongKey.outcome, wrongKey.label).toMatchObject({ ok: false, error: { name: 'ProofKeyMismatchError' } })
  for (const n of verifies) expect.soft(n.outcome, n.label).toEqual({ ok: true, value: false })
})
