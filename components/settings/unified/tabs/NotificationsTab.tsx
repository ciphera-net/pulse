'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { SPRING } from '@/lib/motion'
import { useAuth } from '@/lib/auth/context'
import MyPreferencesTab from '@/components/settings/notifications/MyPreferencesTab'
import WorkspaceNotificationsTab from '@/components/settings/notifications/WorkspaceNotificationsTab'

type Sub = 'mine' | 'workspace'

export default function NotificationsTab() {
  const { user } = useAuth()
  const isAdminOrOwner = user?.role === 'owner' || user?.role === 'admin'
  const [sub, setSub] = useState<Sub>('mine')

  return (
    <div>
      {/* Segmented control */}
      <div className="flex gap-1 mb-6 border-b border-white/[0.06]">
        <SubTab id="mine" label="My preferences" active={sub === 'mine'} onClick={() => setSub('mine')} />
        {isAdminOrOwner && (
          <SubTab id="workspace" label="Workspace" active={sub === 'workspace'} onClick={() => setSub('workspace')} />
        )}
      </div>

      {sub === 'mine' ? <MyPreferencesTab /> : <WorkspaceNotificationsTab />}
    </div>
  )
}

function SubTab({
  id,
  label,
  active,
  onClick,
}: {
  id: string
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`relative px-3 py-2 text-sm font-medium whitespace-nowrap rounded-t-lg transition-all duration-base ${
        active ? 'text-brand-orange' : 'text-neutral-500 hover:text-neutral-300'
      } ease-apple`}
    >
      {label}
      {active && (
        <motion.div
          layoutId="notifications-subtab-indicator"
          className="absolute bottom-0 left-2 right-2 h-0.5 bg-brand-orange rounded-full"
          transition={SPRING}
        />
      )}
    </button>
  )
}
