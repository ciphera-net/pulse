'use client'

import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

interface LoadingOverlayProps {
  logoSrc?: string
  title?: string
  portal?: boolean
}

export default function LoadingOverlay({ 
  logoSrc = "/ciphera_icon_no_margins.png", 
  title = "Pulse",
  portal = true
}: LoadingOverlayProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    return () => setMounted(false)
  }, [])

  const content = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-white dark:bg-neutral-950">
      <div className="flex flex-col items-center gap-6">
        <div className="flex items-center gap-3">
          <img 
            src={logoSrc} 
            alt={typeof title === 'string' ? title : "Pulse"} 
            className="h-12 w-auto object-contain"
          />
          <span className="text-3xl font-bold tracking-tight text-neutral-900 dark:text-white">
            {title}
          </span>
        </div>
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-neutral-200 border-t-brand-orange dark:border-neutral-800 dark:border-t-brand-orange" />
      </div>
    </div>
  )

  if (portal) {
    if (!mounted) return null
    return createPortal(content, document.body)
  }

  return content
}
