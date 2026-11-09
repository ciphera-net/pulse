/**
 * A thin ring that fills clockwise from 12 o'clock. Pulse draws one ring: the top bar's Getting started chip and the
 * sidebar's events card both use this, so the two never drift apart.
 *
 * The track is neutral-800 (the light theme remaps it); the arc is orange unless the caller passes another text colour
 * class, which the ring paints through `currentColor`.
 */
export function ProgressRing({
  progress,
  size = 20,
  arcClassName = 'text-brand-ink',
}: {
  /** 0 to 100. */
  progress: number
  size?: number
  arcClassName?: string
}) {
  const strokeWidth = 2.5
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (progress / 100) * circumference

  return (
    <svg width={size} height={size} className="rotate-[-90deg]" aria-hidden="true">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        className="text-neutral-800"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        className={`${arcClassName} transition-all duration-700 ease-apple`}
      />
    </svg>
  )
}
