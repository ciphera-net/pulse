'use client'

import { usePathname } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import SiteNav from '@/components/dashboard/SiteNav'

export default function SiteLayoutShell({
  siteId,
  children,
}: {
  siteId: string
  children: React.ReactNode
}) {
  const pathname = usePathname()

  return (
    <>
      <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 pt-8">
        <SiteNav siteId={siteId} />
      </div>
      <AnimatePresence mode="popLayout">
        <motion.div
          key={pathname}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </>
  )
}
