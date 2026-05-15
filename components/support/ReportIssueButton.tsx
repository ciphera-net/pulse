'use client'

import { useAuth } from '@/lib/auth/context'
import { usePathname } from 'next/navigation'
import { Warning } from '@phosphor-icons/react'

export function ReportIssueButton({ siteId, collapsed }: { siteId?: string; collapsed?: boolean }) {
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

  if (collapsed) {
    return (
      <button
        onClick={handleClick}
        className="w-9 h-9 flex items-center justify-center rounded-lg text-neutral-500 hover:text-neutral-300 hover:bg-white/[0.06] transition-colors ease-apple"
        aria-label="Report Issue"
      >
        <Warning className="w-[18px] h-[18px]" />
      </button>
    )
  }

  return (
    <button
      onClick={handleClick}
      className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-neutral-400 hover:text-white hover:bg-white/[0.06] transition-all duration-fast ease-apple w-full overflow-hidden"
    >
      <span className="w-7 h-7 flex items-center justify-center shrink-0">
        <Warning className="w-[18px] h-[18px]" />
      </span>
      <span className="whitespace-nowrap overflow-hidden">Report Issue</span>
    </button>
  )
}
