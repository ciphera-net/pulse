/**
 * Whether this device draws Pulse's NEW look while a page loads: the dither skeleton, and the dashboard's
 * skeleton in the new frame's shape (beta `new-dashboard`, 15-11-2026).
 *
 * 🔴 THE TEAM'S FLAG IS THE SOURCE OF TRUTH (lib/features.ts, /api/v1/me). What is kept here is a per-device
 * COPY of its last known answer, for one reason: a skeleton is on screen exactly while that answer is still on
 * its way. The server's HTML already holds the skeleton, and /me arrives a second later. Read from React, the
 * look would flip from gray bars to the dither in the middle of every hard load. So the answer is remembered in
 * this browser, an inline script in the root layout puts the class on <html> before the body paints (as the
 * theme's does), and the skeleton's markup is the SAME in both looks: the stylesheet alone tells them apart
 * (styles/globals.css, `html.new-dashboard`). `NewDashboardLookSync` corrects the copy once /me has answered.
 *
 * What the copy holds is a look, not an identity: it stays through sign-out, and the next account to sign in on
 * this device corrects it. A browser that has never been told draws today's gray bars.
 *
 * When the new dashboard goes to everyone, the rules in the stylesheet lose their `html.new-dashboard` and this
 * module, its sync component and the script in the root layout are deleted.
 *
 * Leaf module on purpose: the server's root layout imports it for the script and the browser for the rest, so it
 * touches no React and no browser global at import time.
 */

/** On every skeleton bar (components/skeletons.tsx). Styled only under the class below. */
export const SKELETON_BAR_CLASS = 'skeleton'
/** On <html> while this device draws the new look. */
export const NEW_LOOK_CLASS = 'new-dashboard'
/** The per-device copy of the flag's last answer: '1', or absent. */
export const NEW_LOOK_STORAGE_KEY = 'pulse_new_dashboard'

/** Is the new look on, on this page, right now? False on the server. */
export function newLookOn(): boolean {
  return typeof document !== 'undefined' && document.documentElement.classList.contains(NEW_LOOK_CLASS)
}

const listeners = new Set<() => void>()

/** Told whenever the look is switched (the band's animator starts and stops with it). */
export function onNewLookChange(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Switches the look on this page and remembers it on this device. Storage that refuses (a private window, a
 * blocked site) costs the memory and nothing else: the page still follows the flag once /me has answered.
 */
export function setNewLook(on: boolean): void {
  if (typeof document === 'undefined') return
  try {
    if (on) window.localStorage.setItem(NEW_LOOK_STORAGE_KEY, '1')
    else window.localStorage.removeItem(NEW_LOOK_STORAGE_KEY)
  } catch {
    // Nothing to do: see above.
  }
  if (newLookOn() === on) return
  document.documentElement.classList.toggle(NEW_LOOK_CLASS, on)
  listeners.forEach((listener) => listener())
}

/**
 * The inline <head> script that puts the class on <html> before the body paints. It runs before React, so it
 * imports nothing. Allowed by the CSP: script-src carries 'unsafe-inline' (next.config.ts), as the theme's needs.
 */
export function newLookBootScript(): string {
  return `(function(){try{if(localStorage.getItem(${JSON.stringify(NEW_LOOK_STORAGE_KEY)})==='1')document.documentElement.classList.add(${JSON.stringify(NEW_LOOK_CLASS)});}catch(e){}})();`
}
