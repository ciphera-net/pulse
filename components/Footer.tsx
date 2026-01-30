import Link from 'next/link'
import React from 'react'

interface FooterProps {
  LinkComponent?: any
  appName?: string
}

export function Footer({ LinkComponent = Link, appName = 'Pulse' }: FooterProps) {
  const Component = LinkComponent

  return (
    <footer className="border-t border-neutral-200 dark:border-neutral-800 mt-auto bg-white dark:bg-neutral-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="text-sm text-neutral-500 dark:text-neutral-400">
            © {new Date().getFullYear()} Ciphera. All rights reserved.
          </div>
          <div className="flex gap-6 text-sm font-medium text-neutral-600 dark:text-neutral-300">
            <Component href="/about" className="hover:text-brand-orange transition-colors">
              Why {appName}
            </Component>
            <Component href="/security" className="hover:text-brand-orange transition-colors">
              Security
            </Component>
            <Component href="/faq" className="hover:text-brand-orange transition-colors">
              FAQ
            </Component>
            <Component href="/installation" className="hover:text-brand-orange transition-colors">
              Installation
            </Component>
          </div>
        </div>
      </div>
    </footer>
  )
}
