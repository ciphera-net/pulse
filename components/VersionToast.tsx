'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowClockwise, X } from '@phosphor-icons/react'
import { useVersionCheck, type NewVersionReason } from '@/lib/hooks/useVersionCheck'
import { markUpdateReady, useUpdateNoticeClaimed } from '@/lib/updateNotice'

/**
 * The "a new version is ready" notice, and the one poller behind it (useVersionCheck). It publishes the update to
 * lib/updateNotice.ts and steps aside wherever the What's new button has claimed the notice (the whats-new beta, in
 * the dashboard's top bar). A tab broken by a failed chunk load always shows it, claimed or not.
 */
export default function VersionToast() {
  const [visible, setVisible] = useState(false)
  const [broken, setBroken] = useState(false)
  const claimed = useUpdateNoticeClaimed()

  useVersionCheck((reason: NewVersionReason) => {
    markUpdateReady()
    if (reason === 'chunk') setBroken(true)
    setVisible(true)
  })

  if (!visible || (claimed && !broken)) return null

  return createPortal(
    <div className="fixed top-4 right-4 z-50 max-w-sm animate-in fade-in slide-in-from-top-2" style={{ animationDuration: '300ms' }}>
      <div className="flex items-center gap-3 px-4 py-3 rounded-none border border-neutral-800 bg-neutral-900">
        <ArrowClockwise className="w-5 h-5 text-brand-ink shrink-0" weight="bold" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white">Update available</p>
          <p className="text-xs text-neutral-400">A new version of Pulse is ready.</p>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="px-3 py-1.5 text-xs font-medium text-white bg-brand-orange hover:bg-brand-orange-button-hover rounded-none transition-colors ease-apple shrink-0"
        >
          Refresh
        </button>
        <button
          onClick={() => {
            setVisible(false)
            setBroken(false)
          }}
          className="p-1 text-neutral-500 hover:text-white transition-colors ease-apple shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>,
    document.body
  )
}
