'use client'

import { useState, useCallback, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X, GearSix, Buildings, User } from '@phosphor-icons/react'
import { useUnifiedSettings } from '@/lib/unified-settings-context'
import { useAuth } from '@/lib/auth/context'
import { useSite } from '@/lib/swr/dashboard'
import { listSites, type Site } from '@/lib/api/sites'

// Tab content components — Site
import SiteGeneralTab from './tabs/SiteGeneralTab'
import SiteGoalsTab from './tabs/SiteGoalsTab'
import SiteVisibilityTab from './tabs/SiteVisibilityTab'
import SitePrivacyTab from './tabs/SitePrivacyTab'
import SiteBotSpamTab from './tabs/SiteBotSpamTab'
import SiteReportsTab from './tabs/SiteReportsTab'
import SiteIntegrationsTab from './tabs/SiteIntegrationsTab'
// Tab content components — Workspace
import WorkspaceGeneralTab from './tabs/WorkspaceGeneralTab'
import WorkspaceBillingTab from './tabs/WorkspaceBillingTab'
import WorkspaceMembersTab from './tabs/WorkspaceMembersTab'
import WorkspaceNotificationsTab from './tabs/WorkspaceNotificationsTab'
import WorkspaceAuditTab from './tabs/WorkspaceAuditTab'
// Tab content components — Account
import AccountProfileTab from './tabs/AccountProfileTab'
import AccountSecurityTab from './tabs/AccountSecurityTab'
import AccountDevicesTab from './tabs/AccountDevicesTab'

// ─── Types ──────────────────────────────────────────────────────

type SettingsContext = 'site' | 'workspace' | 'account'

interface TabDef {
  id: string
  label: string
}

const SITE_TABS: TabDef[] = [
  { id: 'general', label: 'General' },
  { id: 'goals', label: 'Goals' },
  { id: 'visibility', label: 'Visibility' },
  { id: 'privacy', label: 'Privacy' },
  { id: 'bot-spam', label: 'Bot & Spam' },
  { id: 'reports', label: 'Reports' },
  { id: 'integrations', label: 'Integrations' },
]

const WORKSPACE_TABS: TabDef[] = [
  { id: 'general', label: 'General' },
  { id: 'members', label: 'Members' },
  { id: 'billing', label: 'Billing' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'audit', label: 'Audit Log' },
]

const ACCOUNT_TABS: TabDef[] = [
  { id: 'profile', label: 'Profile' },
  { id: 'security', label: 'Security' },
  { id: 'devices', label: 'Devices' },
]

// ─── Context Switcher ───────────────────────────────────────────

function ContextSwitcher({
  active,
  onChange,
  activeSiteDomain,
}: {
  active: SettingsContext
  onChange: (ctx: SettingsContext) => void
  activeSiteDomain: string | null
}) {
  return (
    <div className="flex items-center gap-1 p-1 bg-neutral-800/50 rounded-xl">
      {/* Site button — locked to current site, no dropdown */}
      {activeSiteDomain && (
        <button
          onClick={() => onChange('site')}
          className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
            active === 'site'
              ? 'bg-neutral-700 text-white shadow-sm'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          <GearSix weight="bold" className="w-4 h-4" />
          <span className="hidden sm:inline">{activeSiteDomain}</span>
        </button>
      )}

      <button
        onClick={() => onChange('workspace')}
        className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
          active === 'workspace'
            ? 'bg-neutral-700 text-white shadow-sm'
            : 'text-neutral-400 hover:text-white'
        }`}
      >
        <Buildings weight="bold" className="w-4 h-4" />
        <span className="hidden sm:inline">Organization</span>
      </button>

      <button
        onClick={() => onChange('account')}
        className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
          active === 'account'
            ? 'bg-neutral-700 text-white shadow-sm'
            : 'text-neutral-400 hover:text-white'
        }`}
      >
        <User weight="bold" className="w-4 h-4" />
        <span className="hidden sm:inline">Account</span>
      </button>
    </div>
  )
}

// ─── Tab Bar ────────────────────────────────────────────────────

function TabBar({
  tabs,
  activeTab,
  onChange,
}: {
  tabs: TabDef[]
  activeTab: string
  onChange: (id: string) => void
}) {
  return (
    <div className="flex gap-1 overflow-x-auto overflow-y-hidden scrollbar-hide pb-px">
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`relative px-3 py-2 text-sm font-medium whitespace-nowrap rounded-lg transition-all duration-200 ${
            activeTab === tab.id
              ? 'text-brand-orange'
              : 'text-neutral-500 hover:text-neutral-300'
          }`}
        >
          {tab.label}
          {activeTab === tab.id && (
            <motion.div
              layoutId="settings-tab-indicator"
              className="absolute bottom-0 left-2 right-2 h-0.5 bg-brand-orange rounded-full"
              transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
            />
          )}
        </button>
      ))}
    </div>
  )
}

// ─── Tab Content ────────────────────────────────────────────────

function ComingSoon({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="rounded-full bg-neutral-800 p-4 mb-4">
        <GearSix className="w-8 h-8 text-neutral-500" />
      </div>
      <h3 className="text-lg font-semibold text-white mb-1">{label}</h3>
      <p className="text-sm text-neutral-400 max-w-sm">
        This section is being migrated. For now, use the existing settings page.
      </p>
    </div>
  )
}

function TabContent({
  context,
  activeTab,
  siteId,
}: {
  context: SettingsContext
  activeTab: string
  siteId: string | null
}) {
  // Site tabs
  if (context === 'site' && siteId) {
    switch (activeTab) {
      case 'general': return <SiteGeneralTab siteId={siteId} />
      case 'goals': return <SiteGoalsTab siteId={siteId} />
      case 'visibility': return <SiteVisibilityTab siteId={siteId} />
      case 'privacy': return <SitePrivacyTab siteId={siteId} />
      case 'bot-spam': return <SiteBotSpamTab siteId={siteId} />
      case 'reports': return <SiteReportsTab siteId={siteId} />
      case 'integrations': return <SiteIntegrationsTab siteId={siteId} />
    }
  }

  // Workspace tabs
  if (context === 'workspace') {
    switch (activeTab) {
      case 'general': return <WorkspaceGeneralTab />
      case 'billing': return <WorkspaceBillingTab />
      case 'members': return <WorkspaceMembersTab />
      case 'notifications': return <WorkspaceNotificationsTab />
      case 'audit': return <WorkspaceAuditTab />
    }
  }

  // Account tabs
  if (context === 'account') {
    switch (activeTab) {
      case 'profile': return <AccountProfileTab />
      case 'security': return <AccountSecurityTab />
      case 'devices': return <AccountDevicesTab />
    }
  }

  return null
}

// ─── Main Modal ─────────────────────────────────────────────────

export default function UnifiedSettingsModal() {
  const { isOpen, closeUnifiedSettings: closeSettings, initialTab: initTab } = useUnifiedSettings()
  const { user } = useAuth()

  const [context, setContext] = useState<SettingsContext>('site')
  const [siteTabs, setSiteTabs] = useState('general')
  const [workspaceTabs, setWorkspaceTabs] = useState('general')
  const [accountTabs, setAccountTabs] = useState('profile')

  const [sites, setSites] = useState<Site[]>([])
  const [activeSiteId, setActiveSiteId] = useState<string | null>(null)

  // Apply initial tab when modal opens
  useEffect(() => {
    if (isOpen && initTab) {
      if (initTab.context) setContext(initTab.context)
      if (initTab.tab) {
        if (initTab.context === 'site') setSiteTabs(initTab.tab)
        else if (initTab.context === 'workspace') setWorkspaceTabs(initTab.tab)
        else if (initTab.context === 'account') setAccountTabs(initTab.tab)
      }
    }
  }, [isOpen, initTab])

  // Detect site from URL and load sites list when modal opens
  useEffect(() => {
    if (!isOpen || !user?.org_id) return

    // Pick up site ID from URL — this is the only site the user can configure
    if (typeof window !== 'undefined') {
      const match = window.location.pathname.match(/\/sites\/([a-f0-9-]+)/)
      if (match) {
        setActiveSiteId(match[1])
        setContext('site')
      } else {
        // Not on a site page — default to organization context
        setActiveSiteId(null)
        if (!initTab?.context) setContext('workspace')
      }
    }

    // Load sites for domain display
    listSites().then(data => {
      setSites(Array.isArray(data) ? data : [])
    }).catch(() => {})
  }, [isOpen, user?.org_id])

  // Escape key closes
  useEffect(() => {
    if (!isOpen) return
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeSettings()
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [isOpen, closeSettings])

  const tabs = context === 'site' ? SITE_TABS : context === 'workspace' ? WORKSPACE_TABS : ACCOUNT_TABS
  const activeTab = context === 'site' ? siteTabs : context === 'workspace' ? workspaceTabs : accountTabs
  const setActiveTab = context === 'site' ? setSiteTabs : context === 'workspace' ? setWorkspaceTabs : setAccountTabs

  const handleContextChange = useCallback((ctx: SettingsContext) => {
    setContext(ctx)
  }, [])

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm"
            onClick={closeSettings}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ type: 'spring', bounce: 0.15, duration: 0.35 }}
            className="fixed inset-0 z-[61] flex items-center justify-center p-4 pointer-events-none"
          >
            <div
              className="pointer-events-auto w-full max-w-3xl h-[85vh] bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="shrink-0 px-6 pt-5 pb-4 border-b border-neutral-800/60">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-white">Settings</h2>
                  <button
                    onClick={closeSettings}
                    className="p-1.5 rounded-lg text-neutral-500 hover:text-white hover:bg-neutral-800 transition-colors"
                  >
                    <X weight="bold" className="w-4 h-4" />
                  </button>
                </div>

                {/* Context Switcher */}
                <ContextSwitcher
                  active={context}
                  onChange={handleContextChange}
                  activeSiteDomain={sites.find(s => s.id === activeSiteId)?.domain ?? null}
                />

                {/* Tabs */}
                <div className="mt-4">
                  <TabBar tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
                </div>
              </div>

              {/* Content — parent has fixed h-[85vh] so this fills remaining space without jumping */}
              <div className="flex-1 overflow-y-auto overflow-x-hidden">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={`${context}-${activeTab}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.12 }}
                    className="p-6"
                  >
                    <TabContent context={context} activeTab={activeTab} siteId={activeSiteId} />
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
