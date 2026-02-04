'use client'

import { OfflineBanner } from '@/components/OfflineBanner'
import { Header, Footer } from '@ciphera-net/ui'
import { useAuth } from '@/lib/auth/context'
import { useOnlineStatus } from '@/lib/hooks/useOnlineStatus'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { getUserOrganizations, switchContext } from '@/lib/api/organization'
import { setSessionAction } from '@/app/actions/auth'
import { useRouter } from 'next/navigation'

export default function LayoutContent({ children }: { children: React.ReactNode }) {
  const auth = useAuth()
  const router = useRouter()
  const isOnline = useOnlineStatus()
  const [orgs, setOrgs] = useState<any[]>([])
  
  // * Fetch organizations for the header workspace switcher
  useEffect(() => {
    if (auth.user) {
      getUserOrganizations()
        .then((organizations) => setOrgs(organizations))
        .catch(err => console.error('Failed to fetch orgs for header', err))
    }
  }, [auth.user])

  const handleSwitchWorkspace = async (orgId: string | null) => {
    if (!orgId) return // Pulse doesn't support personal workspace
    try {
      const { access_token } = await switchContext(orgId)
      await setSessionAction(access_token)
      window.location.reload()
    } catch (err) {
      console.error('Failed to switch workspace', err)
    }
  }

  const handleCreateOrganization = () => {
    router.push('/onboarding')
  }
  
  const showOfflineBar = Boolean(auth.user && !isOnline);
  const barHeightRem = '2.5rem';

  return (
    <>
      {auth.user && <OfflineBanner />}
      <Header 
        auth={auth} 
        LinkComponent={Link} 
        logoSrc="/pulse_icon_no_margins.png"
        appName="Pulse"
        orgs={orgs}
        activeOrgId={auth.user?.org_id}
        onSwitchWorkspace={handleSwitchWorkspace}
        onCreateOrganization={handleCreateOrganization}
        allowPersonalWorkspace={false}
        showFaq={false}
        showSecurity={false}
        showPricing={true}
        topOffset={showOfflineBar ? barHeightRem : undefined}
      />
      <main className={`flex-1 pb-8 ${showOfflineBar ? 'pt-[8.5rem]' : 'pt-24'}`}>
        {children}
      </main>
      <Footer 
        LinkComponent={Link}
        appName="Pulse"
        showPricing={true}
        showSecurity={false}
      />
    </>
  )
}
