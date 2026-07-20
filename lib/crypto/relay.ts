/**
 * Relay encryption module — ECDH P-256 + AES-256-GCM
 *
 * Encrypts the notification email for Ciphera Relay using the Web Crypto API.
 * No WASM or third-party crypto dependencies.
 *
 * Wire format: ephemeral_public_key (65 bytes) || IV (12 bytes) || ciphertext+tag
 *
 * Ported VERBATIM from id-frontend (lib/crypto/relay.ts). The ONLY Pulse-specific
 * change is the public-key fetch base: id-frontend imports ID_API_URL from its own
 * client; Pulse imports ID_API_URL from `@/lib/api/client` (the id-backend base —
 * the relay public-key route lives on id-backend, NOT the Pulse analytics API, so
 * it must NOT go through `apiRequest`, which would route a non-/auth path to
 * API_URL). The HKDF `info` label ('ciphera-relay-v2'), empty salt, and P-256 curve
 * are unchanged — they MUST match id-backend's relay envelope, or the relay cannot
 * decrypt the new email and delivery breaks.
 */

import { ID_API_URL } from '@/lib/api/client'

/**
 * Encrypt an email for Ciphera Relay using ECDH P-256 + AES-256-GCM.
 */
export async function sealForRelay(
  email: string,
  relayPublicKey: Uint8Array
): Promise<Uint8Array> {
  const encoder = new TextEncoder()

  // Import relay's P-256 public key
  const relayKey = await crypto.subtle.importKey(
    'raw',
    relayPublicKey as BufferSource,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  )

  // Generate ephemeral ECDH keypair
  const ephemeral = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  )

  // ECDH shared secret
  const sharedSecret = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: relayKey },
    ephemeral.privateKey,
    256
  )

  // HKDF to derive AES key
  const hkdfKey = await crypto.subtle.importKey(
    'raw',
    sharedSecret,
    'HKDF',
    false,
    ['deriveBits']
  )
  const aesKeyBits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(0),
      info: encoder.encode('ciphera-relay-v2'),
    },
    hkdfKey,
    256
  )
  const aesKey = await crypto.subtle.importKey(
    'raw',
    aesKeyBits,
    'AES-GCM',
    false,
    ['encrypt']
  )

  // AES-256-GCM encrypt
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    encoder.encode(email)
  )

  // Export ephemeral public key (uncompressed, 65 bytes)
  const ephPubRaw = await crypto.subtle.exportKey('raw', ephemeral.publicKey)
  const ephPubBytes = new Uint8Array(ephPubRaw)

  // Wire format: ephPub (65) || iv (12) || ciphertext+tag
  const sealed = new Uint8Array(ephPubBytes.length + iv.length + ciphertext.byteLength)
  sealed.set(ephPubBytes)
  sealed.set(iv, ephPubBytes.length)
  sealed.set(new Uint8Array(ciphertext), ephPubBytes.length + iv.length)

  return sealed
}

// ---------------------------------------------------------------------------
// Public key fetching with in-memory cache
// ---------------------------------------------------------------------------

let cachedRelayPublicKey: Uint8Array | null = null

/**
 * Fetch (and cache) the relay's P-256 public key from id-backend.
 */
export async function getRelayPublicKey(): Promise<Uint8Array> {
  if (cachedRelayPublicKey) return cachedRelayPublicKey

  const res = await fetch(`${ID_API_URL}/api/v1/relay/public-key`)
  if (!res.ok) {
    throw new Error(`Failed to fetch relay public key: ${res.status}`)
  }

  const data = await res.json()

  const keyB64 = data.public_key
  const decoded = Uint8Array.from(atob(keyB64), c => c.charCodeAt(0))

  cachedRelayPublicKey = decoded
  return cachedRelayPublicKey
}
