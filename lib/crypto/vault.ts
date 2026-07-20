/**
 * Shared vault data shape.
 *
 * The vault stores sensitive identity fields (email, display name, TOTP secret).
 * It is sealed/opened client-side by the Tessera OPAQUE Session (a non-extractable
 * VMK) via lib/crypto/vault-ops — the server only ever sees the opaque 0x01
 * envelope, so plaintext never leaves the client.
 *
 * Ported VERBATIM from id-frontend (lib/crypto/vault.ts) — the shape must match
 * what id-frontend seals so a vault written by either app reopens on the other.
 */

export interface VaultData {
  email: string
  display_name?: string
  totp_secret?: string
}
