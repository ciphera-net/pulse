'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion } from 'framer-motion'
import { useTabListKeyboard } from '@/lib/hooks/useTabListKeyboard'
import { useAuth } from '@/lib/auth/context'

interface SiteNavProps {
  siteId: string
}

export default function SiteNav({ siteId }: SiteNavProps) {
  const pathname = usePathname()
  const handleTabKeyDown = useTabListKeyboard()
  const { user } = useAuth()
  const canEdit = user?.role === 'owner' || user?.role === 'admin'

  const tabs = [
    { label: 'Dashboard', href: `/sites/${siteId}` },
    { label: 'Uptime', href: `/sites/${siteId}/uptime` },
    { label: 'Funnels', href: `/sites/${siteId}/funnels` },
    ...(canEdit ? [{ label: 'Settings', href: `/sites/${siteId}/settings` }] : []),
  ]

  const isActive = (href: string) => {
    if (href === `/sites/${siteId}`) {
      return pathname === href || pathname === `${href}/realtime`
    }
    return pathname.startsWith(href)
  }

  return (
    <div className="border-b border-neutral-200 dark:border-neutral-800 mb-6">
      <nav className="flex gap-1" role="tablist" aria-label="Site navigation" onKeyDown={handleTabKeyDown}>
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            role="tab"
            aria-selected={isActive(tab.href)}
            tabIndex={isActive(tab.href) ? 0 : -1}
            className={`relative px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange rounded-t cursor-pointer -mb-px ${
              isActive(tab.href)
                ? 'text-neutral-900 dark:text-white'
                : 'text-neutral-400 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
            }`}
          >
            {tab.label}
            {isActive(tab.href) && (
              <motion.div
                layoutId="activeTab"
                className="absolute inset-x-0 -bottom-px h-0.5 bg-brand-orange"
                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
              />
            )}
          </Link>
        ))}
      </nav>
    </div>
  )
}
