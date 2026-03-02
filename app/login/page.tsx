'use client'

import { useEffect } from 'react'
import { initiateOAuthFlow } from '@/lib/api/oauth'
import { LoadingOverlay } from '@ciphera-net/ui'

export default function LoginPage() {
  useEffect(() => {
    // * Immediately initiate OAuth flow when page loads
    initiateOAuthFlow()
  }, [])

  return (
    <LoadingOverlay
      logoSrc="/pulse_icon_no_margins.png"
      title="Redirecting to log in..."
    />
  )
}
