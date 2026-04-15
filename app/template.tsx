'use client'

import { usePathname } from 'next/navigation'

/**
 * Root template — wraps every route's children with a fade + 16px slide-in
 * over 500ms on mount. CSS-only via tailwindcss-animate.
 *
 * The `key={pathname}` is required: React's reconciler otherwise reuses the
 * outer <div> across client-side navigations, which means `animate-in` only
 * plays on the very first page load (never on subsequent route changes).
 * Giving the div a new key per path forces unmount/remount, so the animation
 * plays fresh on every navigation — matching what users see on hard reload.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  return (
    <div
      key={pathname}
      className="animate-in fade-in slide-in-from-bottom-4"
      style={{ animationDuration: '500ms', animationTimingFunction: 'var(--ease-apple)' }}
    >
      {children}
    </div>
  )
}
