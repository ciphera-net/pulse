/**
 * Vault key handle — the in-memory OPAQUE vault handle.
 *
 * Wraps a Tessera `Session['vault']` ({ seal, open }) backed by a NON-EXTRACTABLE
 * CryptoKey (the VMK). There are no raw key bytes in JS to wipe — dropping the
 * reference lets the GC reclaim the key.
 *
 * Ported from id-frontend (lib/auth/vault-key.tsx) as the TYPE ONLY. Under Pulse's
 * re-auth-in-settings design (plan 20-07-2026 §6, recommendation B) the handle
 * lives for the duration of ONE settings operation, held in a local `useRef`
 * inside the re-auth modal and dropped in a `finally` — so the app-wide
 * `VaultKeyProvider`/`VaultKeyContext` from id-frontend is deliberately NOT ported.
 */

import type { Session } from '@ciphera-net/tessera'

export type VaultKeyHandle = { kind: 'opaque'; vault: Session['vault'] }
