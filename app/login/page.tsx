'use client'

import { useEffect } from 'react'
import { initiateOAuthFlow } from '@/lib/api/oauth'
import LoadingOverlay from '@/components/LoadingOverlay'

export default function LoginPage() {
  useEffect(() => {
    // * Immediately initiate OAuth flow when page loads
    initiateOAuthFlow()
  }, [])

  return (
    <LoadingOverlay 
      title="Redirecting to sign in..."
    />
  )
}
