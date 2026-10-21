'use client'

import { useEffect } from 'react'
import { isFramed } from '@/lib/scope/embed'

type WorkboxWindow = Window & { workbox?: { register: () => Promise<unknown> } }

/**
 * Registers the app's service worker (/sw.js, built by next-pwa) in a top-level window only.
 *
 * next-pwa registered it itself (`register: true`) on every page, the framed /demo included,
 * and pulse.ciphera.net's home page frames /demo for every desktop visitor. The worker is
 * scoped to `/`, claims its clients at once and precaches the whole dashboard build, so every
 * prospect who opened the home page got the dashboard's worker fronting the marketing pages.
 *
 * next.config.ts now sets `register: false`, which turns off exactly one line of next-pwa's
 * client entry: it still creates `window.workbox` on every page (and still reloads on
 * reconnect). This component makes the call next-pwa made, `window.workbox.register()` (which
 * waits for the page's load event), minus the frame. No `window.workbox` means next-pwa did not
 * set one up (dev, or no service-worker support), and then nothing registers, as before.
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (isFramed()) return
    const workbox = (window as WorkboxWindow).workbox
    if (!workbox) return
    workbox.register().catch(() => {
      // As with next-pwa's own registration: no worker means no offline cache, never a broken page.
    })
  }, [])
  return null
}
