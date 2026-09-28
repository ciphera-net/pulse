/**
 * The setup rail's bar, on its own (PULSE-118, M11): a quiet counter over a 2 px
 * track with one orange fill. SetupRail draws the wizard's steps with it and the
 * Import tab draws an upload's parts with it, so the product has ONE progress
 * device rather than a second variant with its own height and timing.
 *
 * The caller owns the outer element and its `role="progressbar"` semantics,
 * because only the caller knows what the bar counts.
 */
export function RailBar({ left, pct, fillTestId }: { left: React.ReactNode; pct: number; fillTestId?: string }) {
  return (
    <>
      <div className="mb-2 flex items-center justify-between text-xs text-neutral-500">
        <span>{left}</span>
        <span className="tabular-nums">{pct}%</span>
      </div>
      <div className="h-0.5 w-full bg-neutral-800">
        <div
          className="h-0.5 bg-brand-orange transition-[width] duration-base ease-apple motion-reduce:transition-none"
          style={{ width: `${pct}%` }}
          data-testid={fillTestId}
        />
      </div>
    </>
  )
}
