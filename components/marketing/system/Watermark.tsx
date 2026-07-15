/**
 * Typographic signature — an SVG `<text>` whose `textLength` force-justifies
 * "PRIVACY-FIRST ANALYTICS" to exactly the rail width at every viewport, so any
 * slack becomes letter-spacing (`lengthAdjust="spacing"`). Stroke-only, no fill,
 * at a whisper opacity. Purely decorative (aria-hidden wrapper).
 */
export function Watermark() {
  return (
    <div className="px-6 py-4" aria-hidden="true">
      <svg
        viewBox="0 0 1104 96"
        className="h-auto w-full select-none text-foreground/[0.16]"
        role="presentation"
      >
        <text
          x="0"
          y="90"
          textLength="1104"
          lengthAdjust="spacing"
          fill="transparent"
          stroke="currentColor"
          strokeWidth="1.25"
          style={{
            font: '700 118px var(--font-space-grotesk), "Space Grotesk", sans-serif',
          }}
        >
          PRIVACY-FIRST ANALYTICS
        </text>
      </svg>
    </div>
  )
}
