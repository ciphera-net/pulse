'use client'

import { useEffect } from 'react'
import { initiateOAuthFlow } from '@/lib/api/oauth'
import LoadingOverlay from '@/components/LoadingOverlay'

export default function SignupPage() {
  useEffect(() => {
    // * Immediately initiate OAuth flow when page loads
    // * The auth service will handle showing signup vs login
    initiateOAuthFlow()
  }, [])

  return (
    <LoadingOverlay 
      title="Redirecting to sign up..."
    />
  )
}
