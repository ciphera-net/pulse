'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import { AnimatePresence, motion } from 'framer-motion'
import { X, GearSix, Buildings, User } from '@phosphor-icons/react'
import { Button, Spinner } from '@ciphera-net/ui'
import { useUnifiedSettings } from '@/lib/unified-settings-context'
import { useAuth } from '@/lib/auth/context'
import { useSite } from '@/lib/swr/dashboard'
import { listSites, type Site } from '@/lib/api/sites'

// Lazy-load tab components — only loaded when the tab is first rendered
const tabLoader = () => <div className="flex items-center justify-center py-12"><Spinner className="w-6 h-6 text-neutral-500" /></div>
const SiteGeneralTab = dynamic(() => import('./tabs/SiteGeneralTab'), { loading: tabLoader })
const SiteGoalsTab = dynamic(() => import('./tabs/SiteGoalsTab'), { loading: tabLoader })
const SiteVisibilityTab = dynamic(() => import('./tabs/SiteVisibilityTab'), { loading: tabLoader })
const SitePrivacyTab = dynamic(() => import('./tabs/SitePrivacyTab'), { loading: tabLoader })
const SiteBotSpamTab = dynamic(() => import('./tabs/SiteBotSpamTab'), { loading: tabLoader })
const SiteReportsTab = dynamic(() => import('./tabs/SiteReportsTab'), { loading: tabLoader })
const SiteIntegrationsTab = dynamic(() => import('./tabs/SiteIntegrationsTab'), { loading: tabLoader })
const WorkspaceGeneralTab = dynamic(() => import('./tabs/WorkspaceGeneralTab'), { loading: tabLoader })
const WorkspaceBillingTab = dynamic(() => import('./tabs/WorkspaceBillingTab'), { loading: tabLoader })
const WorkspaceMembersTab = dynamic(() => import('./tabs/WorkspaceMembersTab'), { loading: tabLoader })
const WorkspaceNotificationsTab = dynamic(() => import('./tabs/WorkspaceNotificationsTab'), { loading: tabLoader })
const WorkspaceAuditTab = dynamic(() => import('./tabs/WorkspaceAuditTab'), { loading: tabLoader })
const AccountProfileTab = dynamic(() => import('./tabs/AccountProfileTab'), { loading: tabLoader })
const AccountSecurityTab = dynamic(() => import('./tabs/AccountSecurityTab'), { loading: tabLoader })
const AccountDevicesTab = dynamic(() => import('./tabs/AccountDevicesTab'), { loading: tabLoader })

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
  const items: { id: SettingsContext; icon: React.ReactNode; label: string; visible: boolean }[] = [
    { id: 'site', icon: <GearSix weight="bold" className="w-4 h-4" />, label: activeSiteDomain || '', visible: !!activeSiteDomain },
    { id: 'workspace', icon: <Buildings weight="bold" className="w-4 h-4" />, label: 'Organization', visible: true },
    { id: 'account', icon: <User weight="bold" className="w-4 h-4" />, label: 'Account', visible: true },
  ]

  return (
    <div className="flex items-center gap-1 p-1 bg-neutral-800/50 rounded-xl">
      {items.filter(i => i.visible).map(item => (
        <button
          key={item.id}
          onClick={() => onChange(item.id)}
          className={`relative flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors duration-200 ${
            active === item.id ? 'text-white' : 'text-neutral-400 hover:text-white'
          }`}
        >
          {active === item.id && (
            <motion.div
              layoutId="context-switcher-bg"
              className="absolute inset-0 bg-neutral-700 rounded-lg shadow-sm"
              transition={{ type: 'spring', bounce: 0.15, duration: 0.35 }}
            />
          )}
          <span className="relative z-10 flex items-center gap-2">
            {item.icon}
            <span className="hidden sm:inline">{item.label}</span>
          </span>
        </button>
      ))}
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
  onDirtyChange,
  onRegisterSave,
}: {
  context: SettingsContext
  activeTab: string
  siteId: string | null
  onDirtyChange: (dirty: boolean) => void
  onRegisterSave: (fn: () => Promise<void>) => void
}) {
  const dirtyProps = { onDirtyChange, onRegisterSave }
  // Site tabs
  if (context === 'site' && siteId) {
    switch (activeTab) {
      case 'general': return <SiteGeneralTab siteId={siteId} {...dirtyProps} />
      case 'goals': return <SiteGoalsTab siteId={siteId} />
      case 'visibility': return <SiteVisibilityTab siteId={siteId} {...dirtyProps} />
      case 'privacy': return <SitePrivacyTab siteId={siteId} {...dirtyProps} />
      case 'bot-spam': return <SiteBotSpamTab siteId={siteId} {...dirtyProps} />
      case 'reports': return <SiteReportsTab siteId={siteId} />
      case 'integrations': return <SiteIntegrationsTab siteId={siteId} />
    }
  }

  // Workspace tabs
  if (context === 'workspace') {
    switch (activeTab) {
      case 'general': return <WorkspaceGeneralTab {...dirtyProps} />
      case 'billing': return <WorkspaceBillingTab />
      case 'members': return <WorkspaceMembersTab />
      case 'notifications': return <WorkspaceNotificationsTab {...dirtyProps} />
      case 'audit': return <WorkspaceAuditTab />
    }
  }

  // Account tabs
  if (context === 'account') {
    switch (activeTab) {
      case 'profile': return <AccountProfileTab {...dirtyProps} />
      case 'security': return <AccountSecurityTab />
      case 'devices': return <AccountDevicesTab />
    }
  }

  return null
}

// ─── Main Modal ─────────────────────────────────────────────────

export default function UnifiedSettingsModal() {
  const { isOpen, openUnifiedSettings, closeUnifiedSettings: closeSettings, initialTab: initTab } = useUnifiedSettings()
  const { user } = useAuth()

  const [context, setContext] = useState<SettingsContext>('site')
  const [siteTabs, setSiteTabs] = useState('general')
  const [workspaceTabs, setWorkspaceTabs] = useState('general')
  const [accountTabs, setAccountTabs] = useState('profile')

  const [sites, setSites] = useState<Site[]>([])
  const [activeSiteId, setActiveSiteId] = useState<string | null>(null)

  // ─── Dirty state & pending navigation ────────────────────────
  const isDirtyRef = useRef(false)
  const [isDirtyVisible, setIsDirtyVisible] = useState(false)
  const pendingActionRef = useRef<(() => void) | null>(null)
  const [hasPendingAction, setHasPendingAction] = useState(false)
  const saveHandlerRef = useRef<(() => Promise<void>) | null>(null)
  const [saving, setSaving] = useState(false)
  const [showGlass, setShowGlass] = useState(false)

  const handleDirtyChange = useCallback((dirty: boolean) => {
    isDirtyRef.current = dirty
    setIsDirtyVisible(dirty)
    // If user saved and there was a pending action, execute it
    if (!dirty && pendingActionRef.current) {
      const action = pendingActionRef.current
      pendingActionRef.current = null
      setHasPendingAction(false)
      action()
    }
  }, [])

  const handleRegisterSave = useCallback((fn: () => Promise<void>) => {
    saveHandlerRef.current = fn
  }, [])

  const handleSaveFromBar = useCallback(async () => {
    if (!saveHandlerRef.current) return
    setSaving(true)
    try {
      await saveHandlerRef.current()
    } finally {
      setSaving(false)
    }
  }, [])

  /** Run action if clean, or store as pending if dirty */
  const guardedAction = useCallback((action: () => void) => {
    if (isDirtyRef.current) {
      pendingActionRef.current = action
      setHasPendingAction(true)
    } else {
      action()
    }
  }, [])

  const handleDiscard = useCallback(() => {
    isDirtyRef.current = false
    setIsDirtyVisible(false)
    setHasPendingAction(false)
    saveHandlerRef.current = null
    const action = pendingActionRef.current
    pendingActionRef.current = null
    action?.()
  }, [])

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

  // Reset dirty state when modal opens
  useEffect(() => {
    if (isOpen) {
      isDirtyRef.current = false
      pendingActionRef.current = null
      setHasPendingAction(false)
      setShowGlass(true)
    }
  }, [isOpen])

  // Detect site from URL and load sites list when modal opens
  useEffect(() => {
    if (!isOpen || !user?.org_id) return

    if (initTab?.siteId) {
      // Site ID passed explicitly (e.g. from home page site card)
      setActiveSiteId(initTab.siteId)
      if (!initTab?.context) setContext('site')
    } else if (typeof window !== 'undefined') {
      const match = window.location.pathname.match(/\/sites\/([a-f0-9-]+)/)
      if (match) {
        setActiveSiteId(match[1])
        // Only default to site context if no specific context was requested
        if (!initTab?.context) setContext('site')
      } else {
        setActiveSiteId(null)
        if (!initTab?.context) setContext('workspace')
      }
    }

    // Only fetch sites if we don't have them yet
    if (sites.length === 0) {
      listSites().then(data => {
        setSites(Array.isArray(data) ? data : [])
      }).catch(() => {})
    }
  }, [isOpen, user?.org_id])

  // Global keyboard shortcuts: `,` toggles settings, Escape closes
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      if (e.key === ',' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        if (isOpen) guardedAction(closeSettings)
        else openUnifiedSettings()
      }
      if (e.key === 'Escape' && isOpen) {
        guardedAction(closeSettings)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, openUnifiedSettings, closeSettings, guardedAction])

  const tabs = context === 'site' ? SITE_TABS : context === 'workspace' ? WORKSPACE_TABS : ACCOUNT_TABS
  const activeTab = context === 'site' ? siteTabs : context === 'workspace' ? workspaceTabs : accountTabs
  const setActiveTab = context === 'site' ? setSiteTabs : context === 'workspace' ? setWorkspaceTabs : setAccountTabs

  const handleContextChange = useCallback((ctx: SettingsContext) => {
    guardedAction(() => {
      setContext(ctx)
      if (ctx === 'site') setSiteTabs('general')
      else if (ctx === 'workspace') setWorkspaceTabs('general')
      else if (ctx === 'account') setAccountTabs('profile')
    })
  }, [guardedAction])

  const handleTabChange = useCallback((tabId: string) => {
    guardedAction(() => setActiveTab(tabId))
  }, [guardedAction, setActiveTab])

  const handleClose = useCallback(() => {
    guardedAction(closeSettings)
  }, [guardedAction, closeSettings])

  const handleBackdropClick = useCallback(() => {
    guardedAction(closeSettings)
  }, [guardedAction, closeSettings])

  return (
    <>
      {/* Backdrop — fades in/out */}
      <div
        className={`fixed inset-0 z-[60] bg-black/50 transition-opacity duration-200 ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={handleBackdropClick}
      />

      {/* Glass panel — always mounted, fades out on close */}
      <div
        className={`fixed inset-0 z-[61] flex items-center justify-center p-4 ${
          isOpen
            ? 'opacity-100 pointer-events-auto transition-opacity duration-150'
            : showGlass
              ? 'opacity-0 pointer-events-none transition-opacity duration-150'
              : 'opacity-0 pointer-events-none invisible'
        }`}
        onClick={handleBackdropClick}
      >
        <div
          className="relative w-full max-w-4xl h-[90vh] bg-neutral-900/65 backdrop-blur-3xl backdrop-saturate-150 supports-[backdrop-filter]:bg-neutral-900/60 border border-white/[0.08] rounded-2xl shadow-xl shadow-black/20 flex flex-col overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          {/* Content animates in/out */}
          <AnimatePresence onExitComplete={() => setShowGlass(false)}>
            {isOpen && (
            <motion.div
              className="flex flex-col h-full"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.15 }}
            >
              {/* Header */}
              <div className="shrink-0 px-6 pt-5 pb-4 border-b border-white/[0.06]">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-white">Settings</h2>
                  <button
                    onClick={handleClose}
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
                  <TabBar tabs={tabs} activeTab={activeTab} onChange={handleTabChange} />
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto overflow-x-hidden">
                <div key={`${context}-${activeTab}`} className="p-6">
                  <TabContent context={context} activeTab={activeTab} siteId={activeSiteId} onDirtyChange={handleDirtyChange} onRegisterSave={handleRegisterSave} />
                </div>
              </div>

              {/* Save bar */}
              <AnimatePresence>
                {isDirtyVisible && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="shrink-0 overflow-hidden"
                  >
                    <div className={`px-6 py-3 border-t flex items-center justify-between ${
                      hasPendingAction
                        ? 'bg-red-900/10 border-red-900/30'
                        : 'bg-neutral-950/80 border-white/[0.06]'
                    }`}>
                      <span className="text-sm font-medium text-neutral-400">
                        {hasPendingAction ? 'Save or discard to continue' : 'Unsaved changes'}
                      </span>
                      <div className="flex items-center gap-2">
                        {hasPendingAction && (
                          <Button onClick={handleDiscard} variant="secondary" className="text-sm">
                            Discard
                          </Button>
                        )}
                        <Button onClick={handleSaveFromBar} variant="primary" disabled={saving} className="text-sm">
                          {saving ? 'Saving...' : 'Save Changes'}
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </>
  )
}
