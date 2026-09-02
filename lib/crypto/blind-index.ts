/**
 * Blind index — thin alias over the shared implementation.
 *
 * The implementation and its parameters (salt 'ciphera-blind-index-v2',
 * 1,000,000 PBKDF2-SHA256 iterations, 16-byte output, hex, email normalised
 * with .toLowerCase().trim()) now live in ONE place for the whole fleet:
 * @ciphera-net/auth. This file stays as a re-export so existing import paths
 * (`@/lib/crypto/blind-index`) keep working unchanged — no importer moves.
 *
 * Why one package: the blind index is the account-lookup key on the OPAQUE
 * wire, so any drift in those parameters produces a different lookup key —
 * the account "disappears" from login, and an email-change writes an index no
 * future login will match (a permanent lockout). Verbatim copies had already
 * been shown to drift; the wire contract and its known-answer vectors now ship
 * together in the package.
 *
 * Guarded here by blind-index.test.ts (the fleet KAT, which now exercises the
 * package build through this alias) and auth-package.test.ts (the package's
 * own shipped vectors against the version this repo actually resolved).
 */

export { computeBlindIndex } from '@ciphera-net/auth/blind-index'
