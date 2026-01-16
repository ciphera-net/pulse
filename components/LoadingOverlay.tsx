'use client'

import Image from 'next/image'

interface LoadingOverlayProps {
  logoSrc: string
  title: string
}

export default function LoadingOverlay({ logoSrc, title }: LoadingOverlayProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/80 dark:bg-neutral-950/80 backdrop-blur-sm">
      <div className="text-center">
        <div className="mb-4 flex justify-center">
          <Image
            src={logoSrc}
            alt={title}
            width={64}
            height={64}
            className="animate-pulse"
          />
        </div>
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-neutral-200 border-t-brand-orange mx-auto mb-4"></div>
        <p className="text-neutral-600 dark:text-neutral-400">Loading...</p>
      </div>
    </div>
  )
}
