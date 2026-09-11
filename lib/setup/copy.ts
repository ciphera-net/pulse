/**
 * Every human-readable string in the setup wizard, in one place.
 *
 * 🔴 WHY ONE FILE. The 11-09-2026 rebuild put the words through their own round
 * (structure first, then copy — the owner picks each from options), and the
 * wizard's three pages used to carry their headings inline. A copy pick that
 * touches three files and a test is a copy pick that ships half-applied. Every
 * page reads from here; the tests read from here; a new voice is one diff.
 *
 * House rules these strings obey, and that a future edit must keep:
 *   - sentence case; no em or en dashes (the 03-09 customer-copy rule); at most
 *     one exclamation mark in the whole set, and only where it is earned
 *   - step 2's line carries the two facts the onboarding trap taught: someone
 *     ELSE can do the install, and you can LEAVE and come back
 *   - step 3 must be true for a site that has no data yet, which is the usual
 *     case at that moment. "You're in" is true; "you're all set" is a claim
 *   - the person's own domain is on screen as a chip from step 2, so no heading
 *     needs to repeat it
 *
 * Design: Pulse/docs/plans/11-09-2026-setup-flow-rebuild-and-two-plan-design.md §2.4
 */

export interface SetupStepCopy {
  /** The one big heading. ≤ 34 characters. */
  heading: string
  /** The single line under it. ≤ 120 characters. */
  dek: string
}

export interface SetupCopy {
  site: SetupStepCopy
  install: SetupStepCopy
  done: SetupStepCopy
  /** The done page's one button. */
  doneButton: string
  /** The rail's counter, given the 1-based step and the total. */
  railCounter: (step: number, total: number) => string
  /** Install step: the primary button that moves on (to done, or to checkout when a plan was chosen). */
  installContinue: string
  /** Install step: the same button when the person arrived with a plan picked on the pricing page. */
  installContinueToCheckout: string
}

// The "Momentum" voice — owner's pick, 11-09-2026, from a six-register writer
// panel each attacked by two refuters (AI-tell hunter, truth/house-voice
// checker). Energy builds across the three steps toward the confetti and
// spends the set's one allowed exclamation mark on step 3. Two refuter fixes
// applied before the pick: step 3's dek said the dashboard was "ready", which
// over-claims for a site with no data yet; "waiting" is what is true.
// Rejected registers and why: Pulse/docs/plans/11-09-2026-setup-flow-rebuild-and-two-plan-design.md §2.4.
export const SETUP_COPY: SetupCopy = {
  site: {
    heading: 'Add your site',
    dek: 'Just the domain. Everything else can wait.',
  },
  install: {
    heading: 'Get the script running',
    dek: 'Send it to whoever handles your site, or drop it in yourself. Leave now, pick this up later.',
  },
  done: {
    heading: 'You’re in!',
    dek: 'The dashboard’s waiting. It fills in the moment your script sees a visitor.',
  },
  doneButton: 'Go to dashboard',
  railCounter: (step, total) => `Step ${step} of ${total}`,
  installContinue: 'Continue',
  installContinueToCheckout: 'Continue to checkout',
}

/** The three steps a new person walks, in order. `/setup/plan` is deliberately
 *  absent: it is the checkout page, reached only when a plan was chosen on the
 *  pricing page, and it is shown in the rail only then (see SetupRail). */
export const SETUP_LADDER = [
  { key: 'site', path: '/setup/site', label: 'Add your site' },
  { key: 'install', path: '/setup/install', label: 'Install the script' },
  { key: 'done', path: '/setup/done', label: 'Done' },
] as const

export type SetupLadderKey = (typeof SETUP_LADDER)[number]['key']
