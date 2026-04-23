'use client'

import { useEffect } from 'react'
import { initiateSignupFlow } from '@/lib/api/oauth'
import { LoadingOverlay } from '@ciphera-net/ui'
import { cdnUrl } from '@/lib/cdn'

export default function SignupPage() {
  useEffect(() => {
    // * Immediately initiate signup flow when page loads
    initiateSignupFlow()
  }, [])

  return (
    <LoadingOverlay 
      logoSrc={cdnUrl('/pulse_icon_no_margins.png')}
      title="Redirecting to sign up..."
    />
  )
}
