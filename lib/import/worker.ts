/// <reference lib="webworker" />
// ─── The import worker's entry point ──────────────────────────────────────
//
// Deliberately thin: everything it does lives in worker-host.ts and the pure
// core, which vitest runs directly. This file only binds the host to the
// worker's global scope.
//
// 🔴 It is NOT loaded through the Next bundle. scripts/build-worker.mjs builds
// it into ONE self-contained file, public/workers/import.js, served from the
// app's own origin: Next emits chunks under `assetPrefix` (the static CDN), and
// a browser refuses a cross-origin Worker script whatever the CSP says. The
// orchestrator (index.ts) starts it with `new Worker('/workers/import.js')`.

import { createWorkerHost } from './worker-host'
import type { ToWorker } from './protocol'

declare const self: DedicatedWorkerGlobalScope

const host = createWorkerHost((message) => self.postMessage(message))

self.addEventListener('message', (event: MessageEvent<ToWorker>) => {
  void host(event.data)
})
