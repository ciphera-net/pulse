'use client'

import { Lifebuoy } from '@phosphor-icons/react'

/**
 * Sidebar-bottom entry to support. Replaces the old Report Issue button, which
 * opened help.ciphera.net/support — a route that has been 404 since the
 * support-widget stack was decommissioned (29-07-2026). /contact is the live,
 * purpose-built support page (sales, technical support, billing, security);
 * a new tab keeps the dashboard state the user is asking about intact.
 */
export function HelpSupportButton({ collapsed }: { collapsed?: boolean }) {
  if (collapsed) {
    return (
      <a
        href="/contact"
        target="_blank"
        rel="noopener noreferrer"
        className="w-9 h-9 flex items-center justify-center rounded-none text-neutral-500 hover:text-neutral-300 hover:bg-white/[0.06] transition-colors ease-apple"
        aria-label="Help &amp; Support"
      >
        <Lifebuoy className="w-[18px] h-[18px]" />
      </a>
    )
  }

  return (
    <a
      href="/contact"
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2.5 rounded-none px-2.5 py-2 text-sm font-medium text-neutral-400 hover:text-white hover:bg-white/[0.06] transition-all duration-fast ease-apple w-full overflow-hidden"
    >
      <span className="w-7 h-7 flex items-center justify-center shrink-0">
        <Lifebuoy className="w-[18px] h-[18px]" />
      </span>
      <span className="whitespace-nowrap overflow-hidden">Help &amp; Support</span>
    </a>
  )
}
