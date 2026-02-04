'use client'

import { OfflineBanner } from '@/components/OfflineBanner'
import { Header, Footer, GridIcon } from '@ciphera-net/ui'
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
  const barHeightRem = 2.5;
  const headerHeightRem = 6;
  const mainTopPaddingRem = barHeightRem + headerHeightRem;

  return (
    <>
      {auth.user && <OfflineBanner isOnline={isOnline} />}
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
        topOffset={showOfflineBar ? `${barHeightRem}rem` : undefined}
        userMenuCustomItems={
          <Link
            href="/tools"
            className="group flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            <GridIcon className="h-4 w-4 text-neutral-500 group-hover:text-neutral-900 dark:text-neutral-400 dark:group-hover:text-white" />
            Tools
          </Link>
        }
      />
      <main
        className={`flex-1 pb-8 ${showOfflineBar ? '' : 'pt-24'}`}
        style={showOfflineBar ? { paddingTop: `${mainTopPaddingRem}rem` } : undefined}
      >
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
