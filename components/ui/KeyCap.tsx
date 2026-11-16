import type { ReactNode } from 'react'

/**
 * A key, as a small cap beside the thing it does: the Filter button's F, and a letter beside each of the date menu's
 * rows. `className` carries the cap's place and its display (`inline-flex` unless said otherwise), joined as a plain
 * string: cn()'s merge would take `hidden` and `inline-flex` for one property and drop one of them.
 */
export default function KeyCap({ children, className = 'inline-flex' }: { children: ReactNode; className?: string }) {
  return (
    <kbd className={`${className} h-[18px] min-w-[18px] items-center justify-center border border-white/[0.12] px-1 font-sans text-[10px] text-neutral-400`}>
      {children}
    </kbd>
  )
}
