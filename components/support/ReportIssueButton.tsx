'use client'

import { useAuth } from '@/lib/auth/context'
import { usePathname } from 'next/navigation'

export function ReportIssueButton({ siteId }: { siteId?: string }) {
  const { user } = useAuth()
  const pathname = usePathname()

  const handleClick = () => {
    const ctx = {
      siteId,
      page: pathname,
      browser: navigator.userAgent,
      orgId: user?.org_id,
    }
    window.open(
      `https://help.ciphera.net/support?ctx=${btoa(JSON.stringify(ctx))}`,
      '_blank'
    )
  }

  return (
    <button onClick={handleClick} className="text-sm text-neutral-400 hover:text-white transition-colors">
      Report Issue
    </button>
  )
}
