'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth/context'
import ProfileSettings from '@/components/settings/ProfileSettings'
import TrustedDevicesCard from '@/components/settings/TrustedDevicesCard'
import SecurityActivityCard from '@/components/settings/SecurityActivityCard'
import { motion, AnimatePresence } from 'framer-motion'
import {
  UserIcon,
  LockIcon,
  BoxIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  ExternalLinkIcon,
} from '@ciphera-net/ui'

// Inline SVG icons not available in ciphera-ui
function BellIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  )
}

// --- Types ---

type ProfileSubTab = 'profile' | 'security' | 'preferences'

type ActiveSelection =
  | { section: 'profile'; subTab: ProfileSubTab }
  | { section: 'notifications' }
  | { section: 'account' }
  | { section: 'devices' }
  | { section: 'activity' }

type ExpandableSection = 'profile' | 'account'

// --- Sidebar Components ---

function SectionHeader({
  expanded,
  active,
  onToggle,
  icon: Icon,
  label,
  description,
  hasChildren = true,
}: {
  expanded: boolean
  active: boolean
  onToggle: () => void
  icon: React.ElementType
  label: string
  description?: string
  hasChildren?: boolean
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
      {hasChildren ? (
        <ChevronDownIcon
          className={`w-4 h-4 shrink-0 mt-1 transition-transform duration-200 ${
            expanded ? '' : '-rotate-90'
          }`}
        />
      ) : (
        <ChevronRightIcon className={`w-4 h-4 shrink-0 mt-1 transition-transform ${active ? 'rotate-90' : ''}`} />
      )}
    </button>
  )
}

function SubItem({
  active,
  onClick,
  label,
  external = false,
}: {
  active: boolean
  onClick: () => void
  label: string
  external?: boolean
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
      {external && <ExternalLinkIcon className="w-3 h-3 opacity-60" />}
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

// --- Content Components ---

function AccountManagementCard() {
  const accountLinks = [
    {
      label: 'Profile & Personal Info',
      description: 'Update your name, email, and avatar',
      href: 'https://auth.ciphera.net/settings',
      icon: UserIcon,
    },
    {
      label: 'Security & 2FA',
      description: 'Password, two-factor authentication, and passkeys',
      href: 'https://auth.ciphera.net/settings?tab=security',
      icon: LockIcon,
    },
    {
      label: 'Active Sessions',
      description: 'Manage devices logged into your account',
      href: 'https://auth.ciphera.net/settings?tab=sessions',
      icon: BoxIcon,
    },
  ]

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 p-6 shadow-sm">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 rounded-lg bg-brand-orange/10">
          <UserIcon className="w-5 h-5 text-brand-orange" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">Ciphera Account</h2>
          <p className="text-sm text-neutral-500">Manage your account across all Ciphera products</p>
        </div>
      </div>

      <div className="space-y-3">
        {accountLinks.map((link) => (
          <a
            key={link.label}
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-start gap-3 p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 hover:border-brand-orange/30 hover:bg-brand-orange/5 transition-all group"
          >
            <link.icon className="w-5 h-5 text-neutral-400 group-hover:text-brand-orange shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-neutral-900 dark:text-white group-hover:text-brand-orange">
                  {link.label}
                </span>
                <ExternalLinkIcon className="w-3.5 h-3.5 text-neutral-400" />
              </div>
              <p className="text-sm text-neutral-500 mt-0.5">{link.description}</p>
            </div>
            <ChevronRightIcon className="w-4 h-4 text-neutral-400 shrink-0 mt-1" />
          </a>
        ))}
      </div>

      <div className="mt-4 pt-4 border-t border-neutral-200 dark:border-neutral-800">
        <p className="text-xs text-neutral-500">
          These settings apply to your Ciphera Account and affect all products (Drop, Pulse, and Auth).
        </p>
      </div>
    </div>
  )
}

// --- Main Settings Section ---

function AppSettingsSection() {
  const [active, setActive] = useState<ActiveSelection>({ section: 'profile', subTab: 'profile' })
  const [expanded, setExpanded] = useState<Set<ExpandableSection>>(new Set(['profile']))

  const toggleSection = (section: ExpandableSection) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(section)) {
        next.delete(section)
      } else {
        next.add(section)
      }
      return next
    })
  }

  const selectSubTab = (selection: ActiveSelection) => {
    setActive(selection)
    if ('subTab' in selection) {
      setExpanded(prev => new Set(prev).add(selection.section as ExpandableSection))
    }
  }

  const renderContent = () => {
    switch (active.section) {
      case 'profile':
        return <ProfileSettings activeTab={active.subTab} />
      case 'notifications':
        return (
          <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 p-8 shadow-sm">
            <div className="text-center max-w-md mx-auto">
              <BellIcon className="w-12 h-12 text-neutral-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-neutral-900 dark:text-white mb-2">Notification Preferences</h3>
              <p className="text-sm text-neutral-500 mb-4">
                Configure which notifications you receive and how you want to be notified.
              </p>
              <Link
                href="/notifications"
                className="inline-flex items-center gap-2 px-4 py-2 bg-brand-orange text-white rounded-lg hover:bg-brand-orange/90 transition-colors"
              >
                Open Notification Center
                <ChevronRightIcon className="w-4 h-4" />
              </Link>
            </div>
          </div>
        )
      case 'account':
        return <AccountManagementCard />
      case 'devices':
        return <TrustedDevicesCard />
      case 'activity':
        return <SecurityActivityCard />
      default:
        return null
    }
  }

  return (
    <div className="flex flex-col lg:flex-row gap-8">
      {/* Sidebar Navigation */}
      <nav className="w-full lg:w-72 flex-shrink-0 space-y-6">
        {/* Pulse Settings Section */}
        <div>
          <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3 px-4">
            Pulse Settings
          </h3>
          <div className="space-y-1">
            <div>
              <SectionHeader
                expanded={expanded.has('profile')}
                active={active.section === 'profile'}
                onToggle={() => {
                  toggleSection('profile')
                  if (!expanded.has('profile')) {
                    selectSubTab({ section: 'profile', subTab: 'profile' })
                  }
                }}
                icon={UserIcon}
                label="Profile & Preferences"
                description="Your profile and sharing defaults"
              />
              <ExpandableSubItems expanded={expanded.has('profile')}>
                <SubItem
                  active={active.section === 'profile' && active.subTab === 'profile'}
                  onClick={() => selectSubTab({ section: 'profile', subTab: 'profile' })}
                  label="Profile"
                />
                <SubItem
                  active={active.section === 'profile' && active.subTab === 'security'}
                  onClick={() => selectSubTab({ section: 'profile', subTab: 'security' })}
                  label="Security"
                />
                <SubItem
                  active={active.section === 'profile' && active.subTab === 'preferences'}
                  onClick={() => selectSubTab({ section: 'profile', subTab: 'preferences' })}
                  label="Preferences"
                />
              </ExpandableSubItems>
            </div>

            {/* Notifications (flat, no expansion) */}
            <SectionHeader
              expanded={false}
              active={active.section === 'notifications'}
              onToggle={() => setActive({ section: 'notifications' })}
              icon={BellIcon}
              label="Notifications"
              description="Email and in-app notifications"
              hasChildren={false}
            />
          </div>
        </div>

        {/* Ciphera Account Section */}
        <div className="pt-4 border-t border-neutral-200 dark:border-neutral-800">
          <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3 px-4">
            Ciphera Account
          </h3>
          <div>
            <SectionHeader
              expanded={expanded.has('account')}
              active={active.section === 'account'}
              onToggle={() => {
                toggleSection('account')
                if (!expanded.has('account')) {
                  setActive({ section: 'account' })
                }
              }}
              icon={LockIcon}
              label="Manage Account"
              description="Security, 2FA, and sessions"
            />
            <ExpandableSubItems expanded={expanded.has('account')}>
              <SubItem
                active={false}
                onClick={() => window.open('https://auth.ciphera.net/settings', '_blank')}
                label="Profile & Personal Info"
                external
              />
              <SubItem
                active={false}
                onClick={() => window.open('https://auth.ciphera.net/settings?tab=security', '_blank')}
                label="Security & 2FA"
                external
              />
              <SubItem
                active={false}
                onClick={() => window.open('https://auth.ciphera.net/settings?tab=sessions', '_blank')}
                label="Active Sessions"
                external
              />
              <SubItem
                active={active.section === 'devices'}
                onClick={() => setActive({ section: 'devices' })}
                label="Trusted Devices"
              />
              <SubItem
                active={active.section === 'activity'}
                onClick={() => setActive({ section: 'activity' })}
                label="Security Activity"
              />
            </ExpandableSubItems>
          </div>
        </div>
      </nav>

      {/* Content Area */}
      <div className="flex-1 min-w-0">
        {renderContent()}
      </div>
    </div>
  )
}

export default function SettingsPageClient() {
  const { user } = useAuth()

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold text-neutral-900 dark:text-white">Settings</h1>
        <p className="mt-2 text-neutral-600 dark:text-neutral-400">
          Manage your Pulse preferences and Ciphera account settings
        </p>
      </div>

      {/* Breadcrumb / Context */}
      <div className="flex items-center gap-2 text-sm text-neutral-500">
        <span>You are signed in as</span>
        <span className="font-medium text-neutral-900 dark:text-white">{user?.email}</span>
        <span>&bull;</span>
        <a
          href="https://auth.ciphera.net/settings"
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand-orange hover:underline inline-flex items-center gap-1"
        >
          Manage in Ciphera Account
          <ExternalLinkIcon className="w-3 h-3" />
        </a>
      </div>

      {/* Settings Content */}
      <AppSettingsSection />
    </div>
  )
}
