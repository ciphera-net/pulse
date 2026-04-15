'use client'

/**
 * Root template — wraps every route's children with a subtle fade + slide-in
 * on mount. Re-runs on every navigation (App Router template.tsx semantics),
 * making route changes feel fluid instead of hard-swapped.
 *
 * CSS-only via tailwindcss-animate — no Framer Motion on the route boundary,
 * keeping overhead < 5ms per transition.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-1 duration-base ease-apple">
      {children}
    </div>
  )
}
