'use client'

import { MenuIcon } from '@ciphera-net/ui'

export default function ContentHeader({
  onMobileMenuOpen,
}: {
  onMobileMenuOpen: () => void
}) {
  return (
    <div className="shrink-0 flex items-center border-b border-neutral-200/60 dark:border-neutral-800/60 bg-white/90 dark:bg-neutral-900/90 backdrop-blur-xl px-4 py-3.5 md:hidden">
      <button
        onClick={onMobileMenuOpen}
        className="p-2 -ml-2 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
        aria-label="Open navigation"
      >
        <MenuIcon className="w-5 h-5" />
      </button>
    </div>
  )
}
