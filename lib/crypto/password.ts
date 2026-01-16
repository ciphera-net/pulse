/**
 * Password protection utilities using PBKDF2
 */

/**
 * Derive a key from password using PBKDF2
 * This is used to encrypt the file encryption key when password protection is enabled
 */
export async function deriveKeyFromPassword(
  password: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  // * Import password as key material
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  )

  // * Derive key using PBKDF2
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: 100000, // * High iteration count for security
      hash: 'SHA-256',
    },
    passwordKey,
    {
      name: 'AES-GCM',
      length: 256,
    },
    false, // not extractable
    ['encrypt', 'decrypt']
  )
}

/**
 * Derive an authentication key from password and email (used as salt).
 * This ensures the raw password never leaves the client.
 */
export async function deriveAuthKey(
  password: string,
  email: string
): Promise<string> {
  const encoder = new TextEncoder()
  
  // * Import password as key material
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  )

  // * Derive bits using PBKDF2
  // * We use the email as a deterministic salt for the auth key
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: encoder.encode(email),
      iterations: 100000,
      hash: 'SHA-256',
    },
    passwordKey,
    256 // 256 bits = 32 bytes
  )

  // * Convert to hex string
  return Array.from(new Uint8Array(derivedBits))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Generate a random salt for PBKDF2
 */
export function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(16))
}

/**
 * Encrypt a key with a password-derived key
 */
export async function encryptKeyWithPassword(
  key: Uint8Array,
  password: string
): Promise<{ encrypted: ArrayBuffer; iv: Uint8Array; salt: Uint8Array }> {
  const salt = generateSalt()
  const derivedKey = await deriveKeyFromPassword(password, salt)
  const iv = crypto.getRandomValues(new Uint8Array(12))

  const encrypted = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv as BufferSource,
    },
    derivedKey,
    key as BufferSource
  )

  return {
    encrypted,
    iv,
    salt,
  }
}

/**
 * Decrypt a key using a password
 */
export async function decryptKeyWithPassword(
  encrypted: ArrayBuffer,
  iv: Uint8Array,
  salt: Uint8Array,
  password: string
): Promise<Uint8Array> {
  const derivedKey = await deriveKeyFromPassword(password, salt)

  const decrypted = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: iv as BufferSource,
    },
    derivedKey,
    encrypted
  )

  return new Uint8Array(decrypted)
}
