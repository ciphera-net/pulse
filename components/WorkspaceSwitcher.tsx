'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PlusIcon, PersonIcon, CubeIcon, CheckIcon } from '@radix-ui/react-icons'
import { switchContext, OrganizationMember } from '@/lib/api/organization'
import { setSessionAction } from '@/app/actions/auth'
import Link from 'next/link'

export default function WorkspaceSwitcher({ orgs, activeOrgId }: { orgs: OrganizationMember[], activeOrgId: string | null }) {
  const router = useRouter()
  const [switching, setSwitching] = useState<string | null>(null)
  
  const handleSwitch = async (orgId: string | null) => {
    console.log('Switching to workspace:', orgId)
    setSwitching(orgId || 'personal')
    try {
      // * If orgId is null, we can't switch context via API in the same way if strict mode is on
      // * BUT, Pulse doesn't support personal workspace.
      // * So we should probably NOT show the "Personal" option in Pulse if strict mode is enforced.
      // * However, to match Drop exactly, we might want to show it but have it fail or redirect?
      // * Let's assume for now we want to match Drop's UI structure.
      
      if (!orgId) {
          // * Pulse doesn't support personal context. 
          // * We could redirect to onboarding or show an error.
          // * For now, let's just return to avoid breaking.
          return
      }

      const { token, refresh_token } = await switchContext(orgId)
      
      // * Update session cookie via server action
      await setSessionAction(token, refresh_token)
      
      // Force reload to pick up new permissions
      window.location.reload() 
      
    } catch (err) {
      console.error('Failed to switch workspace', err)
      setSwitching(null)
    }
  }

  return (
    <div className="border-b border-neutral-100 dark:border-neutral-800 pb-2 mb-2">
      <div className="px-3 py-2 text-xs font-medium text-neutral-500 uppercase tracking-wider">
        Workspaces
      </div>
      
      {/* Personal Workspace - HIDDEN IN PULSE (Strict Mode) */}
      {/* 
      <button
        onClick={() => handleSwitch(null)}
        className={`w-full flex items-center justify-between px-3 py-2 text-sm rounded-md transition-colors group ${
            !activeOrgId ? 'bg-neutral-100 dark:bg-neutral-800' : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/50'
        }`}
      >
        <div className="flex items-center gap-2">
          <div className="h-5 w-5 rounded bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center">
            <PersonIcon className="h-3 w-3 text-neutral-500 dark:text-neutral-400" />
          </div>
          <span className="text-neutral-700 dark:text-neutral-300">Personal</span>
        </div>
        <div className="flex items-center gap-2">
            {switching === 'personal' && <span className="text-xs text-neutral-400">Loading...</span>}
            {!activeOrgId && !switching && <CheckIcon className="h-4 w-4 text-neutral-600 dark:text-neutral-400" />}
        </div>
      </button>
      */}
      
      {/* Organization Workspaces */}
      {orgs.map((org) => (
        <button
          key={org.organization_id}
          onClick={() => handleSwitch(org.organization_id)}
          className={`w-full flex items-center justify-between px-3 py-2 text-sm rounded-md transition-colors mt-1 ${
            activeOrgId === org.organization_id ? 'bg-neutral-100 dark:bg-neutral-800' : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/50'
          }`}
        >
          <div className="flex items-center gap-2">
            <div className="h-5 w-5 rounded bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <CubeIcon className="h-3 w-3 text-blue-600 dark:text-blue-400" />
            </div>
            <span className="text-neutral-700 dark:text-neutral-300 truncate max-w-[140px]">
              {org.organization_name}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {switching === org.organization_id && <span className="text-xs text-neutral-400">Loading...</span>}
            {activeOrgId === org.organization_id && !switching && <CheckIcon className="h-4 w-4 text-neutral-600 dark:text-neutral-400" />}
          </div>
        </button>
      ))}

      {/* Create New */}
      <Link
        href="/onboarding"
        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-neutral-500 hover:text-blue-600 dark:text-neutral-400 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/10 rounded-md transition-colors mt-1"
      >
        <div className="h-5 w-5 rounded border border-dashed border-neutral-300 dark:border-neutral-600 flex items-center justify-center">
          <PlusIcon className="h-3 w-3" />
        </div>
        <span>Create Organization</span>
      </Link>
    </div>
  )
}
