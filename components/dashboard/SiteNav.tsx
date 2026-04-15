'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion } from 'framer-motion'
import { SPRING } from '@/lib/motion'
import { useTabListKeyboard } from '@/lib/hooks/useTabListKeyboard'

interface SiteNavProps {
  siteId: string
}

export default function SiteNav({ siteId }: SiteNavProps) {
  const pathname = usePathname()
  const handleTabKeyDown = useTabListKeyboard()

  const tabs = [
    { label: 'Dashboard', href: `/sites/${siteId}` },
    { label: 'Journeys', href: `/sites/${siteId}/journeys` },
    { label: 'Funnels', href: `/sites/${siteId}/funnels` },
    { label: 'Behavior', href: `/sites/${siteId}/behavior` },
    { label: 'Search', href: `/sites/${siteId}/search` },
    { label: 'CDN', href: `/sites/${siteId}/cdn` },
    { label: 'Uptime', href: `/sites/${siteId}/uptime` },
  ]

  const isActive = (href: string) => {
    if (href === `/sites/${siteId}`) {
      return pathname === href
    }
    return pathname.startsWith(href)
  }

  return (
    <div className="mb-6 overflow-x-auto scrollbar-hide">
      <nav className="flex gap-1 min-w-max border-b border-neutral-200 dark:border-neutral-800" role="tablist" aria-label="Site navigation" onKeyDown={handleTabKeyDown}>
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            role="tab"
            aria-selected={isActive(tab.href)}
            tabIndex={isActive(tab.href) ? 0 : -1}
            className={`relative shrink-0 whitespace-nowrap px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange rounded-t cursor-pointer -mb-px ${
              isActive(tab.href)
                ? 'text-white'
                : 'text-neutral-400 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
            } ease-apple`}
          >
            {tab.label}
            {isActive(tab.href) && (
              <motion.div
                layoutId="activeTab"
                className="absolute inset-x-0 -bottom-px h-[3px] bg-brand-orange rounded-full"
                transition={SPRING}
              />
            )}
          </Link>
        ))}
      </nav>
    </div>
  )
}
