'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowClockwise, X } from '@phosphor-icons/react'
import { useVersionCheck } from '@/lib/hooks/useVersionCheck'

export default function VersionToast() {
  const [visible, setVisible] = useState(false)

  useVersionCheck(() => setVisible(true))

  if (!visible) return null

  return createPortal(
    <div className="fixed top-4 right-4 z-50 max-w-sm animate-in fade-in slide-in-from-top-2" style={{ animationDuration: '300ms' }}>
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-white/[0.08] bg-neutral-900/95 backdrop-blur-xl shadow-xl shadow-black/40">
        <ArrowClockwise className="w-5 h-5 text-brand-orange shrink-0" weight="bold" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white">Update available</p>
          <p className="text-xs text-neutral-400">A new version of Pulse is ready.</p>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="px-3 py-1.5 text-xs font-medium text-white bg-brand-orange hover:bg-brand-orange-button-hover rounded-lg transition-colors ease-apple shrink-0"
        >
          Refresh
        </button>
        <button
          onClick={() => setVisible(false)}
          className="p-1 text-neutral-500 hover:text-white transition-colors ease-apple shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>,
    document.body
  )
}
