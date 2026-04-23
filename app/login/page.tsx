'use client'

import { useEffect } from 'react'
import { initiateOAuthFlow } from '@/lib/api/oauth'
import { LoadingOverlay } from '@ciphera-net/ui'
import { cdnUrl } from '@/lib/cdn'

export default function LoginPage() {
  useEffect(() => {
    // * Immediately initiate OAuth flow when page loads
    initiateOAuthFlow()
  }, [])

  return (
    <LoadingOverlay
      logoSrc={cdnUrl('/pulse_icon_no_margins.png')}
      title="Redirecting to log in..."
    />
  )
}
