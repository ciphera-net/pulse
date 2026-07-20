import { init as wasmInit } from '@ciphera-net/tessera'

// The Tessera WASM core (OPAQUE handshake, Argon2id blind index, vault seal/open)
// must be loaded + initialised exactly once before any SDK call. wasmInit() is
// itself idempotent, but we memoise the promise so concurrent callers (e.g. a
// login form and a passkey button mounted together) share a single load.
let initPromise: Promise<void> | null = null

/** Idempotent: load + initialise the Tessera WASM core. Await once before any
 *  WASM-backed SDK call (register/login/recover/...). Safe to call repeatedly. */
export function ensureTessera(): Promise<void> {
  return (initPromise ??= wasmInit())
}
