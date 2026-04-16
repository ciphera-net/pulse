'use client'

import { MenuIcon } from '@ciphera-net/ui'

export default function ContentHeader({
  onMobileMenuOpen,
}: {
  onMobileMenuOpen: () => void
}) {
  return (
    // Phase 2 glass audit: bg-neutral-900/90 kept intentionally — /90 opacity needed for sticky-bar legibility over scrolling content
    <div className="shrink-0 flex items-center border-b border-neutral-800/60 bg-neutral-900/90 backdrop-blur-xl px-4 py-3.5 md:hidden">
      <button
        onClick={onMobileMenuOpen}
        className="p-2 -ml-2 text-neutral-400 hover:text-white"
        aria-label="Open navigation"
      >
        <MenuIcon className="w-5 h-5" />
      </button>
    </div>
  )
}
