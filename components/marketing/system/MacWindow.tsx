import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

// A macOS window (dark appearance) around a screenshot — plausible.io's
// device, translated to dark mode. OPERATOR-SANCTIONED EXCEPTION to the
// flat/no-rounded/no-shadow rule (12-07-2026): this chrome DEPICTS macOS
// rather than theming our UI, so it uses the literal macOS values instead
// of theme tokens — 10px window radius (Big Sur+), 12px traffic lights at
// #FF5F57/#FEBC2E/#28C840 with 8px gaps, titlebar gradient #39393b→#2c2c2e
// over a hard hairline, hairline outer border for dark-mode edge definition.
// A browser-tab variant was tried and removed (operator, 13-07): the window
// controls alone carry the "real window" read — keep the bar dots-only.
// `docked` keeps the fold-crop composition: top corners only, no bottom edge.
export function MacWindow({
  docked = false,
  className,
  children,
}: {
  docked?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        // min-w-0 is required by the pannable body below: the inner scroller's
        // 700px min-content propagates up through `min-width:auto` ancestors.
        // (A `contain:inline-size` variant of this fix was tried and REVERTED —
        // it sent /features into a "Maximum update depth exceeded" loop by
        // fighting a ResizeObserver child. Consumers that place a MacWindow in a
        // grid/flex track add their own min-w-0 instead.)
        'min-w-0 overflow-hidden border-white/10 bg-[#161616] shadow-[0_32px_80px_-12px_rgba(0,0,0,0.9)]',
        docked ? 'rounded-t-[10px] border border-b-0' : 'rounded-[10px] border',
        className,
      )}
    >
      <div
        aria-hidden="true"
        className="flex h-10 items-center gap-2 border-b border-black/60 bg-gradient-to-b from-[#39393b] to-[#2c2c2e] px-4"
      >
        <span className="h-3 w-3 rounded-full bg-[#ff5f57] ring-1 ring-inset ring-black/20" />
        <span className="h-3 w-3 rounded-full bg-[#febc2e] ring-1 ring-inset ring-black/20" />
        <span className="h-3 w-3 rounded-full bg-[#28c840] ring-1 ring-inset ring-black/20" />
      </div>
      {/*
       * Below md the capture PANS instead of shrinking.
       *
       * These are 2244-2468px retina screenshots of the real product — the
       * "receipts, not promises" proof. Scaled into a ~342px phone column their
       * baked-in text lands at 3-5px: page paths, the chart's date axis and the
       * stat captions all render as grey noise, so the proof proves nothing.
       * A 700px min-width roughly doubles the legible size and the right-edge
       * mask advertises that there is more to see.
       *
       * The titlebar deliberately sits OUTSIDE this scroller: the window chrome
       * stays at container width while its content pans, which reads as a real
       * window rather than a broken image. Both properties reset at md, so the
       * >=768px rendering is unchanged.
       */}
      <div className="overflow-x-auto md:overflow-x-visible max-md:[mask-image:linear-gradient(to_right,black_calc(100%-28px),transparent)]">
        <div className="min-w-[700px] md:min-w-0">{children}</div>
      </div>
    </div>
  )
}
