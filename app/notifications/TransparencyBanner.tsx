'use client'
import { useState, useEffect } from 'react'

const STORAGE_KEY = 'notif_banner_dismissed_v1'

export default function TransparencyBanner() {
  const [dismissed, setDismissed] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setDismissed(typeof window !== 'undefined' && localStorage.getItem(STORAGE_KEY) === '1')
    setHydrated(true)
  }, [])

  if (!hydrated || dismissed) return null

  const close = () => {
    localStorage.setItem(STORAGE_KEY, '1')
    setDismissed(true)
  }

  return (
    <div className="mb-4 rounded-lg border border-white/[0.08] bg-white/[0.02] p-3 text-sm text-neutral-300 flex items-start gap-3">
      <span className="shrink-0 text-brand-orange mt-0.5" aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      </span>
      <div className="flex-1">
        <strong className="text-white">Your notification history is scoped to your account.</strong>{' '}
        Read items purge in 3–90 days depending on type. Dismiss permanently deletes your copy.{' '}
        <a
          href="https://ciphera.net/blog/what-we-see-about-you-what-we-dont"
          className="text-brand-orange underline underline-offset-2"
          target="_blank"
          rel="noopener noreferrer"
        >
          See what we store ↗
        </a>
      </div>
      <button
        onClick={close}
        aria-label="Dismiss banner"
        className="text-neutral-400 hover:text-white px-1 -mt-1 text-lg leading-none"
        type="button"
      >
        ×
      </button>
    </div>
  )
}
