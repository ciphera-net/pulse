import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  MODAL_SCROLL_CLASS,
  MODAL_CENTER_CLASS,
  MODAL_PANEL_CLASS,
} from '../modalChrome'

/**
 * Guards the one rule these constants exist to hold: SCROLLING AND CENTERING
 * LIVE ON DIFFERENT ELEMENTS.
 *
 * 🔴 What happened, 03-09-2026. RecoveryEnrolModal's backdrop carried
 * `flex items-center justify-center overflow-y-auto` all on one element. A flex
 * container centring a child TALLER than itself overflows it equally in both
 * directions, and the half above the scroll origin is unreachable, because
 * `scrollTop` cannot go negative. The bottom scrolled; the top was gone, with no
 * scrollbar suggesting anything was missing.
 *
 * The recovery-phrase panel is the tallest thing in the product (a 24-word
 * grid), so it hit it first: a user copying down the only existing copy of her
 * recovery phrase could not see the panel's own heading. Measured in a browser
 * at 1440x700 — the reported case — the heading sat 62px ABOVE the viewport;
 * at 1280x480, 172px above. With the fix it sits 41px below the top at every
 * short viewport, and stays centred on a tall one.
 *
 * ⚠️ NOTE THE NEAR-MISS: `overflow-y-auto` WAS present. Adding a scrollbar does
 * not fix this, which is why the bug read as "the modal is too big" rather than
 * "the modal cannot be scrolled to its top". The fix is removing `items-center`
 * from the SCROLLING element, not adding scroll to the centring one.
 *
 * jsdom cannot lay out, so this asserts the STRUCTURE that produces the layout.
 * The measurement itself was done in a real browser and is recorded above.
 */
describe('modal chrome', () => {
  describe('the scroll container', () => {
    it('scrolls', () => {
      expect(MODAL_SCROLL_CLASS).toContain('overflow-y-auto')
    })

    it('🔴 does NOT also centre — that is the bug', () => {
      expect(MODAL_SCROLL_CLASS).not.toMatch(/\bitems-center\b/)
      expect(MODAL_SCROLL_CLASS).not.toMatch(/\bflex\b/)
    })

    it('covers the viewport and sits above the app', () => {
      expect(MODAL_SCROLL_CLASS).toContain('fixed inset-0')
      expect(MODAL_SCROLL_CLASS).toContain('z-[100]')
    })
  })

  describe('the centring wrapper', () => {
    it('centres', () => {
      expect(MODAL_CENTER_CLASS).toContain('flex')
      expect(MODAL_CENTER_CLASS).toContain('items-center')
    })

    /**
     * Without `min-h-full` the wrapper is only as tall as its content, so a
     * SHORT dialog stops being centred and sticks to the top of the viewport.
     * It is what lets one pair of classes serve both cases.
     */
    it('keeps a short dialog centred', () => {
      expect(MODAL_CENTER_CLASS).toContain('min-h-full')
    })

    /**
     * The padding belongs here, not on the scroll container: padding on a
     * scroll container is not part of its scrollable area at the bottom in
     * every engine, so a tall dialog can end flush against the edge.
     */
    it('owns the padding', () => {
      expect(MODAL_CENTER_CLASS).toMatch(/\bp-\d/)
      expect(MODAL_SCROLL_CLASS).not.toMatch(/\bp-\d/)
    })
  })

  /**
   * All three dialogs must USE the constants. Two of them previously had the
   * broken classes inline and were saved only by having short content — the
   * next long dialog would have reintroduced the bug in a file nobody thought
   * to check.
   */
  describe('every settings dialog uses them', () => {
    const MODALS = ['ReauthModal.tsx', 'PasskeyEnrolModal.tsx', 'RecoveryEnrolModal.tsx']
    const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8')

    it('has dialogs to check', () => {
      for (const f of MODALS) expect(read(f).length).toBeGreaterThan(100)
    })

    it('references the shared chrome rather than inlining it', () => {
      for (const f of MODALS) {
        const src = read(f)
        expect(src, `${f} does not import the shared modal chrome`).toContain('modalChrome')
        expect(src, `${f} does not use MODAL_SCROLL_CLASS`).toContain('MODAL_SCROLL_CLASS')
        expect(src, `${f} does not use MODAL_CENTER_CLASS`).toContain('MODAL_CENTER_CLASS')
      }
    })

    it('never hand-rolls a centring scroll container again', () => {
      for (const f of MODALS) {
        const src = read(f)
        // The exact shape that shipped broken.
        expect(src, `${f} inlines a centring scroll container`).not.toMatch(
          /className="[^"]*overflow-y-auto[^"]*items-center/,
        )
        expect(src, `${f} inlines a centring scroll container`).not.toMatch(
          /className="[^"]*items-center[^"]*overflow-y-auto/,
        )
        // And no inline fixed-backdrop string at all — it must come from the
        // shared constant, or the two can drift apart again.
        expect(src, `${f} inlines a fixed backdrop`).not.toMatch(/className="fixed inset-0/)
      }
    })
  })

  it('keeps the panel narrow enough to read a phrase grid in', () => {
    expect(MODAL_PANEL_CLASS).toContain('max-w-sm')
  })
})
