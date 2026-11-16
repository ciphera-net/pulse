import { isTourActive } from '@/lib/tour/constants'

/**
 * The beta the range keys, R and the date menu's letters ship behind (02-11-2026: every new feature ships as a beta;
 * lib/betas.ts). F, `g` + a letter, `,` and `?` are older than it and stay on for everyone.
 */
export const KEYBOARD_SHORTCUTS_FLAG = 'keyboard-shortcuts'

// ─── The keys that pick a date range (16-11-2026, R13: shortcuts for the ranges and the filter) ───
//
// Plausible's letters (plausible.io/docs/keyboard-shortcuts, read 16-11-2026), so somebody moving
// from it keeps their habits. Where Pulse's menu has a row Plausible has no letter for (Last year)
// the row has no key; Plausible's F (Last 28 days) names a row Pulse does not have, and F opens the
// filter here. Keys are compared lower-cased, so Shift does not matter.
//
// 🔴 THE MENU, THE KEYS AND THE `?` OVERLAY READ THIS ONE TABLE. A letter added anywhere else would
// disagree with the cap the reader was shown (ShortcutHandler's SITE_KEY_MAP and the overlay's old
// list did, for `g p`, from 22-09 to 16-11-2026).
export const RANGE_KEYS: Readonly<Record<string, string>> = {
  today: 'd',
  yesterday: 'e',
  '7': 'w',
  '30': 't',
  '3m': 'n',
  '12m': 'l',
  all: 'a',
  month: 'm',
  'last-month': 'p',
  year: 'y',
}

/** Opens the date menu with its calendar. */
export const CUSTOM_RANGE_KEY = 'c'
/** Switches the live view on and off, where the page's orb is a switch (the dashboard and Visitors). */
export const REALTIME_KEY = 'r'
/** Opens the filter (SearchFilter). */
export const FILTER_KEY = 'f'

/** The cap a key is shown as: a letter in capitals, as on a keyboard. */
export function keyCap(key: string): string {
  return key.length === 1 ? key.toUpperCase() : key
}

/** The row a key picks, or null. */
export function rowForKey(key: string): string | null {
  const k = key.toLowerCase()
  for (const [row, letter] of Object.entries(RANGE_KEYS)) if (letter === k) return row
  return null
}

/** Something is being typed, so a letter is a letter. */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el || typeof el.tagName !== 'string') return false
  return el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)
}

/**
 * Whether a key press may act as a page shortcut: one key, with no ⌘, Ctrl or Alt, not held down,
 * not typed into a field, not already handled, and not while the product tour owns the screen.
 *
 * "Already handled" is what keeps `g` + a letter from doing two things: ShortcutHandler listens on the
 * document and prevents the letter's default when it navigates, and every page shortcut listens on the
 * window, which the press reaches after the document. So `g d` goes to the dashboard and does not also
 * pick Today.
 */
export function isPageShortcut(e: KeyboardEvent): boolean {
  if (e.defaultPrevented || e.repeat) return false
  if (e.metaKey || e.ctrlKey || e.altKey) return false
  if (isTypingTarget(e.target)) return false
  if (isTourActive()) return false
  return true
}

/**
 * A control that moves with the arrow keys itself (a funnel's steps, a journey's nodes, the filter's
 * operator) carries `data-own-arrows`: inside it the arrows are its own, even at an end where it lets a
 * press go by, so the page's range never moves under somebody stepping through a chart.
 */
export function ownsArrows(target: EventTarget | null): boolean {
  const el = target as Element | null
  return !!el && typeof el.closest === 'function' && el.closest('[data-own-arrows]') !== null
}

/**
 * Whether a menu, a panel or a dialog is open, so Escape is closing it. Read while the press is being
 * dispatched: a control that closes on Escape changes its state then, and the page shows it later, so
 * its `aria-expanded="true"` is still there for every listener of the same press.
 */
export function somethingIsOpen(doc: Document = document): boolean {
  return doc.querySelector('[aria-expanded="true"], [role="dialog"], [aria-modal="true"]') !== null
}
