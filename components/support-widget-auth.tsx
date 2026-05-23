'use client'

import { SupportWidget } from '@ciphera-net/support-widget'
import { useAuth } from '@/lib/auth/context'

export function SupportWidgetAuth() {
  const { user } = useAuth()

  return (
    <SupportWidget
      baseUrl="https://api.help.ciphera.net"
      wsUrl="https://ws.help.ciphera.net"
      websiteToken="p7bUfxMSBmD3xR4T8v9JeUvL"
      docsUrl="https://help.ciphera.net"
      onShareDetails={user ? () => ({
        email: user.email || undefined,
        name: user.display_name || undefined,
      }) : undefined}
    />
  )
}
