'use client'

import { useState } from 'react'
import ProfileSettings from '@/components/settings/ProfileSettings'
import { motion, AnimatePresence } from 'framer-motion'
import {
  UserIcon,
  ChevronDownIcon,
} from '@ciphera-net/ui'

type ProfileSubTab = 'profile' | 'security' | 'preferences'

function SectionHeader({
  expanded,
  active,
  onToggle,
  icon: Icon,
  label,
  description,
}: {
  expanded: boolean
  active: boolean
  onToggle: () => void
  icon: React.ElementType
  label: string
  description?: string
}) {
  return (
    <button
      onClick={onToggle}
      className={`w-full flex items-start gap-3 px-4 py-3 text-left rounded-xl transition-all duration-200 ${
        active
          ? 'bg-brand-orange/10 text-brand-orange'
          : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
      }`}
    >
      <Icon className="w-5 h-5 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="font-medium">{label}</span>
        {description && (
          <p className={`text-xs mt-0.5 ${active ? 'text-brand-orange/70' : 'text-neutral-500'}`}>
            {description}
          </p>
        )}
      </div>
      <ChevronDownIcon
        className={`w-4 h-4 shrink-0 mt-1 transition-transform duration-200 ${
          expanded ? '' : '-rotate-90'
        }`}
      />
    </button>
  )
}

function SubItem({
  active,
  onClick,
  label,
}: {
  active: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 pl-12 pr-4 py-2 text-sm text-left rounded-lg transition-all duration-150 ${
        active
          ? 'text-brand-orange font-medium bg-brand-orange/5'
          : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-50 dark:hover:bg-neutral-800/50'
      }`}
    >
      <span className="flex-1">{label}</span>
    </button>
  )
}

function ExpandableSubItems({ expanded, children }: { expanded: boolean; children: React.ReactNode }) {
  return (
    <AnimatePresence initial={false}>
      {expanded && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeInOut' }}
          className="overflow-hidden"
        >
          <div className="py-1 space-y-0.5">
            {children}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default function SettingsPageClient() {
  const [activeSubTab, setActiveSubTab] = useState<ProfileSubTab>('profile')
  const [expanded, setExpanded] = useState(true)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-neutral-900 dark:text-white">Settings</h1>
        <p className="mt-2 text-neutral-600 dark:text-neutral-400">
          Manage your account settings and preferences.
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Sidebar Navigation */}
        <nav className="w-full lg:w-72 flex-shrink-0">
          <div>
            <SectionHeader
              expanded={expanded}
              active={true}
              onToggle={() => setExpanded(!expanded)}
              icon={UserIcon}
              label="Profile & Preferences"
              description="Your profile and sharing defaults"
            />
            <ExpandableSubItems expanded={expanded}>
              <SubItem
                active={activeSubTab === 'profile'}
                onClick={() => setActiveSubTab('profile')}
                label="Profile"
              />
              <SubItem
                active={activeSubTab === 'security'}
                onClick={() => setActiveSubTab('security')}
                label="Security"
              />
              <SubItem
                active={activeSubTab === 'preferences'}
                onClick={() => setActiveSubTab('preferences')}
                label="Preferences"
              />
            </ExpandableSubItems>
          </div>
        </nav>

        {/* Content Area */}
        <div className="flex-1 min-w-0">
          <ProfileSettings activeTab={activeSubTab} />
        </div>
      </div>
    </div>
  )
}
