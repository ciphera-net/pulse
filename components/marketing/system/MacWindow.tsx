import type { ReactNode } from 'react'
import Image from 'next/image'
import { cn } from '@/lib/cn'
import { cdnUrl } from '@/lib/cdn'

// A macOS Firefox window (dark appearance) around a screenshot —
// plausible.io's device, translated to dark mode. OPERATOR-SANCTIONED
// EXCEPTION to the flat/no-rounded/no-shadow rule (12-07-2026): this chrome
// DEPICTS a real browser window rather than theming our UI, so it uses the
// literal platform values instead of theme tokens:
// - macOS: 10px window radius (Big Sur+), 12px traffic lights at
//   #FF5F57/#FEBC2E/#28C840 with 8px gaps.
// - Firefox Proton dark: flat #1C1B22 tab strip (Firefox draws its own
//   titlebar), active tab as a floating #42414D pill with 16px favicon,
//   12px #FBFBFE title, muted close glyph; muted "+" new-tab affordance.
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
        className="flex h-11 items-center border-b border-black/60 bg-[#1c1b22] px-4"
      >
        {/* macOS window controls */}
        <div className="flex shrink-0 gap-2">
          <span className="h-3 w-3 rounded-full bg-[#ff5f57] ring-1 ring-inset ring-black/20" />
          <span className="h-3 w-3 rounded-full bg-[#febc2e] ring-1 ring-inset ring-black/20" />
          <span className="h-3 w-3 rounded-full bg-[#28c840] ring-1 ring-inset ring-black/20" />
        </div>

        {/* Active tab — Firefox Proton floating pill */}
        <div className="ml-4 flex h-8 min-w-0 max-w-[240px] items-center gap-2 rounded-[6px] bg-[#42414d] pl-2.5 pr-2 shadow-[0_1px_2px_rgba(0,0,0,0.4)]">
          <Image
            src={cdnUrl('/pulse_icon_no_margins.png')}
            alt=""
            width={32}
            height={32}
            unoptimized
            className="h-4 w-4 shrink-0"
          />
          <span className="truncate text-xs text-[#fbfbfe]">Pulse · ciphera.net</span>
          {/* close glyph */}
          <svg
            viewBox="0 0 12 12"
            className="ml-1 h-3 w-3 shrink-0 text-[#fbfbfe]/60"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          >
            <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" />
          </svg>
        </div>

        {/* new-tab affordance */}
        <svg
          viewBox="0 0 12 12"
          className="ml-3 h-3 w-3 shrink-0 text-[#fbfbfe]/50"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        >
          <path d="M6 1.5v9M1.5 6h9" />
        </svg>
      </div>
      {children}
    </div>
  )
}
