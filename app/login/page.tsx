'use client'

import { useEffect } from 'react'
import { initiateOAuthFlow } from '@/lib/api/oauth'

export default function LoginPage() {
  useEffect(() => {
    // * Immediately initiate OAuth flow when page loads
    initiateOAuthFlow()
  }, [])

  return null
}
