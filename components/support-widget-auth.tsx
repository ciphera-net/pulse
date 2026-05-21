'use client'

import { useEffect, useState, useCallback } from 'react'
import { SupportWidget } from '@ciphera-net/support-widget'
import type { UserIdentity } from '@ciphera-net/support-widget'
import { useAuth } from '@/lib/auth/context'
import apiRequest from '@/lib/api/client'

export function SupportWidgetAuth() {
  const { user } = useAuth()
  const [identity, setIdentity] = useState<UserIdentity | null>(null)

  useEffect(() => {
    if (!user) {
      setIdentity(null)
      return
    }

    let cancelled = false
    const consentKey = `cw_details_shared_${user.id}`
    const hasConsent = localStorage.getItem(consentKey) === 'true'

    apiRequest<{ identifier: string; identifier_hash: string }>('/auth/user/chatwoot-identity')
      .then((data) => {
        if (cancelled) return
        setIdentity({
          identifier: data.identifier,
          identifierHash: data.identifier_hash,
          ...(hasConsent ? { email: user.email || undefined, name: user.display_name || undefined } : {}),
        })
      })
      .catch(() => {
        if (!cancelled) setIdentity(null)
      })

    return () => {
      cancelled = true
    }
  }, [user?.id])

  const handleShareDetails = useCallback(() => {
    if (!user || !identity) return
    localStorage.setItem(`cw_details_shared_${user.id}`, 'true')
    setIdentity((prev) =>
      prev ? { ...prev, email: user.email || undefined, name: user.display_name || undefined } : null
    )
  }, [user, identity])

  const hasConsent = identity?.identifier
    ? localStorage.getItem(`cw_details_shared_${identity.identifier}`) === 'true'
    : false

  return (
    <SupportWidget
      baseUrl="https://api.help.ciphera.net"
      websiteToken="p7bUfxMSBmD3xR4T8v9JeUvL"
      docsUrl="https://help.ciphera.net"
      user={identity}
      onShareDetails={user && !hasConsent ? handleShareDetails : undefined}
    />
  )
}
