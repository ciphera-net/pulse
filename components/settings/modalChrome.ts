/**
 * The overlay chrome shared by every settings dialog.
 *
 * One definition, three consumers (ReauthModal, PasskeyEnrolModal,
 * RecoveryEnrolModal), because the three drifted once already and the way they
 * drifted was invisible until a user hit it.
 *
 * 🔴 SCROLLING AND CENTERING MUST LIVE ON DIFFERENT ELEMENTS. `flex
 * items-center` on a scroll container overflows a too-tall child EQUALLY IN
 * BOTH DIRECTIONS, and the half above the scroll origin is unreachable —
 * `scrollTop` cannot go negative. The bottom scrolls; the top is simply gone,
 * with no scrollbar hinting that anything is missing.
 *
 * Measured 03-09-2026 on a real user's laptop: the recovery-phrase panel's
 * heading was clipped off the top of the screen while she was writing down the
 * only existing copy of her recovery phrase. On a shorter window it would have
 * cut WORDS off the grid — and there is no second chance to read them.
 *
 * ⚠️ Adding `overflow-y-auto` WITHOUT removing `items-center` does not fix it.
 * That was the state that shipped: the scroll was there, and the top was still
 * unreachable, which is why the bug looked like "the modal is too big" rather
 * than "the modal cannot be scrolled to the top".
 */

/** The fixed backdrop. Owns SCROLLING. Must never centre its child. */
export const MODAL_SCROLL_CLASS = 'fixed inset-0 z-[100] overflow-y-auto bg-black/70'

/**
 * The inner wrapper. Owns CENTERING, and the padding.
 *
 * `min-h-full` is what keeps a short dialog centred: the wrapper fills the
 * viewport when the content is small, and grows past it when the content is
 * tall — so the scroll container above can reach every part of it.
 */
export const MODAL_CENTER_CLASS = 'flex min-h-full items-center justify-center p-4'

/** The dialog panel itself. */
export const MODAL_PANEL_CLASS = 'w-full max-w-sm border border-border bg-card p-6 shadow-xl'
