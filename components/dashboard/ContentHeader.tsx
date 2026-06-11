'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { MenuIcon, UserMenu } from '@ciphera-net/facet'
import { useAuth } from '@/lib/auth/context'
import NotificationCenter from '@/components/notifications/NotificationCenter'

export default function ContentHeader({
  onMobileMenuOpen,
}: {
  onMobileMenuOpen: () => void
}) {
  const auth = useAuth()
  const router = useRouter()

  return (
    <div className="shrink-0 flex items-center justify-between border-b border-neutral-800/60 bg-card px-4 py-3.5 md:hidden">
      <button
        onClick={onMobileMenuOpen}
        className="p-2 -ml-2 text-neutral-400 hover:text-white"
        aria-label="Open navigation"
      >
        <MenuIcon className="w-5 h-5" />
      </button>
      <div className="flex items-center gap-1">
        <NotificationCenter anchor="bottom" variant="default" />
        <UserMenu
          auth={auth}
          LinkComponent={Link}
          compact
          anchor="bottom"
          allowPersonalOrganization={false}
          onOpenSettings={() => router.push('/settings/account/profile')}
          onOpenOrgSettings={() => router.push('/settings/organization/general')}
        />
      </div>
    </div>
  )
}
