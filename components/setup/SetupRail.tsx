'use client'

import { usePathname } from 'next/navigation'
import { useSetup } from '@/lib/setup/context'
import { SETUP_COPY, SETUP_LADDER } from '@/lib/setup/copy'

// ---------------------------------------------------------------------------
// The setup wizard's progress rail — direction B, picked by the owner on
// 11-09-2026 from three mocked structures.
//
// WHAT IT REPLACES: SetupStepper, five numbered orange squares joined by
// connectors, with an "Optional" sub-label under the plan step. It was built for
// a five-step ladder that no longer exists: the workspace step was removed on
// 08-09 (provisioned before arrival) and the plan step left the ladder on
// 11-09 (it is the checkout page, not a wizard step). Three steps do not need
// five squares.
//
// WHAT IT IS: a 2 px track with an orange fill and a quiet counter. The fill
// is the fraction of the ladder reached, so the last step reads 100%. Colour is
// the one orange line; there is nothing else to colour.
//
// 🔴 THE PLAN STEP APPEARS ONLY WHEN IT WILL BE WALKED. Somebody who chose a
// plan on the pricing page carries `pendingPlan` through the wizard and does
// finish at checkout, so for them the rail is four steps and honest. For
// everyone else it is three, and no step is ever shown that the person cannot
// reach or is not going to take — the owner's words on the old stepper: "i
// couldn't go to it. but it shouldn't show."
//
// ⚠️ Facet's StepIndicator (dots-and-pill) was considered and not used: the
// owner approved THIS shape from the mock, and the two look different. If the
// rail proves itself, promoting it into Facet is the right next move; swapping
// in a different-looking component after approval is not.
// ---------------------------------------------------------------------------

export default function SetupRail({ className = '' }: { className?: string }) {
  const pathname = usePathname()
  const { pendingPlan } = useSetup()

  const ladder = pendingPlan
    ? [SETUP_LADDER[0], SETUP_LADDER[1], { key: 'plan', path: '/setup/plan', label: 'Choose plan' } as const, SETUP_LADDER[2]]
    : SETUP_LADDER

  const index = ladder.findIndex((s) => pathname?.startsWith(s.path))
  // /setup/org is off the ladder (the provisioning fallback). Render nothing
  // there rather than a rail that claims a step that is not one.
  if (index < 0) return null

  const step = index + 1
  const total = ladder.length
  const pct = Math.round((step / total) * 100)

  return (
    <div
      className={`w-full max-w-lg mb-10 ${className}`}
      role="progressbar"
      aria-label="Setup progress"
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={step}
      aria-valuetext={`${SETUP_COPY.railCounter(step, total)}, ${ladder[index].label}`}
      data-testid="setup-rail"
    >
      <div className="mb-2 flex items-center justify-between text-xs text-neutral-500">
        <span>{SETUP_COPY.railCounter(step, total)}</span>
        <span className="tabular-nums">{pct}%</span>
      </div>
      <div className="h-0.5 w-full bg-neutral-800">
        <div
          className="h-0.5 bg-brand-orange transition-[width] duration-base ease-apple motion-reduce:transition-none"
          style={{ width: `${pct}%` }}
          data-testid="setup-rail-fill"
        />
      </div>
    </div>
  )
}
