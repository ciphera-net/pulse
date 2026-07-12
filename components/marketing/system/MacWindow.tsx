import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

// A macOS window (dark appearance) around a screenshot — plausible.io's
// device, translated to dark mode. OPERATOR-SANCTIONED EXCEPTION to the
// flat/no-rounded/no-shadow rule (12-07-2026): this chrome DEPICTS macOS
// rather than theming our UI, so it uses the literal macOS values instead
// of theme tokens — 10px window radius (Big Sur+), 12px traffic lights at
// #FF5F57/#FEBC2E/#28C840 with 8px gaps, titlebar gradient #39393b→#2c2c2e
// over a hard hairline, hairline outer border for dark-mode edge definition.
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
        'overflow-hidden border-white/10 bg-[#161616] shadow-[0_32px_80px_-12px_rgba(0,0,0,0.9)]',
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
      {children}
    </div>
  )
}
