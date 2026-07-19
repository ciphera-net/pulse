/**
 * Typographic signature — an SVG `<text>` whose `textLength` force-justifies
 * "PRIVACY-FIRST ANALYTICS" to exactly the rail width at every viewport, so any
 * slack becomes letter-spacing (`lengthAdjust="spacing"`). A whisper opacity,
 * purely decorative (aria-hidden wrapper).
 *
 * FILL, never STROKE. Stroking live variable-font text exposes Geist's
 * self-intersecting glyph contours (the B/L/F/R spikes) as stray slivers —
 * fill's nonzero-winding rule hides them completely. The proper "outline"
 * treatment needs pre-baked union'd SVG paths (see website Footer.tsx's
 * "BUILT FOR PRIVACY"), which requires the Geist font file + fonttools/
 * skia-pathops tooling that isn't available in this repo; the honest fallback
 * is fill-only at a size that fits. See memory [[stroked-text-variable-font-landmine]].
 *
 * SIZE, not 118px. The old design stroked Geist 118px, but 23 chars cannot fit
 * the 1104-unit rail at 118px (glyphs would fuse). Dropping to 76px leaves the
 * natural width well under 1104, so `lengthAdjust="spacing"` justifies by ADDING
 * inter-glyph tracking (the intended "slack becomes letter-spacing" behaviour)
 * instead of overlapping letters. See memory [[facet-one-family-geist]].
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
          y="76"
          textLength="1104"
          lengthAdjust="spacing"
          fill="currentColor"
          style={{
            font: '700 76px var(--font-geist-sans), Geist, system-ui, sans-serif',
          }}
        >
          PRIVACY-FIRST ANALYTICS
        </text>
      </svg>
    </div>
  )
}
