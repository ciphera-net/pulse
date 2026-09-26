// Worker doubles for the orchestrator tests. jsdom has no Worker and Node's
// worker_threads is a different API, so these stand in for `new Worker(url)`
// while keeping what matters about one: messages are structured-cloned (a
// File travels by reference, everything else is copied) and delivered
// asynchronously, and a terminated worker says nothing more.

import type { FromWorker, ToWorker } from '../../protocol'
import type { WorkerLike } from '../../index'
import { createWorkerHost } from '../../worker-host'
import type { PipelineHooks } from '../../pipeline'

type Listener = (event: Event) => void

export interface TestWorker extends WorkerLike {
  readonly terminated: boolean
  readonly received: ToWorker[]
  /** Fire the worker's `error` event, as a script that failed to load does. */
  crash(message?: string): void
}

/** A WorkerLike whose other end is `onMessage`, which answers through `reply`. */
export function workerDouble(onMessage: (message: ToWorker, reply: (m: FromWorker) => void) => void): TestWorker {
  const listeners: Record<string, Listener[]> = { message: [], error: [], messageerror: [] }
  const received: ToWorker[] = []
  let terminated = false
  const reply = (m: FromWorker) => {
    if (terminated) return
    const data = structuredClone(m)
    setTimeout(() => {
      if (!terminated) for (const l of listeners.message) l({ data } as unknown as Event)
    }, 0)
  }
  return {
    get terminated() {
      return terminated
    },
    received,
    postMessage(message: ToWorker) {
      if (terminated) return
      const data = structuredClone(message)
      received.push(data)
      setTimeout(() => {
        if (!terminated) onMessage(data, reply)
      }, 0)
    },
    addEventListener(type, listener) {
      listeners[type].push(listener)
    },
    terminate() {
      terminated = true
    },
    crash(message = 'script failed to load') {
      for (const l of listeners.error) l({ message } as unknown as Event)
    },
  }
}

/** The real worker host, in process. */
export function inProcessWorker(hooks: Pick<PipelineHooks, 'limits' | 'planLimits'> = {}): TestWorker {
  let host: ((m: ToWorker) => Promise<void>) | null = null
  return workerDouble((message, reply) => {
    host ??= createWorkerHost(reply, { hooks })
    void host(message)
  })
}

/**
 * The PREBUILT bundle's code, run as a worker would run it: evaluated with a
 * `self` whose postMessage answers the page and whose message listener the
 * page posts to. The globals it needs (TextDecoder, crypto.subtle,
 * DecompressionStream, Blob) are the host's own.
 */
export function bundledWorker(code: string): TestWorker {
  let deliver: ((event: { data: ToWorker }) => void) | null = null
  let reply: ((m: FromWorker) => void) | null = null
  const self = {
    postMessage: (m: FromWorker) => reply?.(m),
    addEventListener: (type: string, fn: (event: { data: ToWorker }) => void) => {
      if (type === 'message') deliver = fn
    },
  }
  new Function('self', code)(self)
  if (!deliver) throw new Error('the bundle registered no message listener on self')
  const listener = deliver as (event: { data: ToWorker }) => void
  return workerDouble((message, r) => {
    reply = r
    listener({ data: message })
  })
}
