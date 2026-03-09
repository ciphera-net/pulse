'use client'

import SiteNav from '@/components/dashboard/SiteNav'

export default function SiteLayoutShell({
  siteId,
  children,
}: {
  siteId: string
  children: React.ReactNode
}) {
  return (
    <>
      <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 pt-8">
        <SiteNav siteId={siteId} />
      </div>
      {children}
    </>
  )
}
