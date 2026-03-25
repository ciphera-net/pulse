'use client'

import { useState, useEffect, useRef } from 'react'
import { Button, Input, Toggle, toast, Spinner } from '@ciphera-net/ui'
import { Copy, CheckCircle, Lock } from '@phosphor-icons/react'
import { AnimatePresence, motion } from 'framer-motion'
import { useSite } from '@/lib/swr/dashboard'
import { updateSite } from '@/lib/api/sites'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3003'

export default function SiteVisibilityTab({ siteId, onDirtyChange, hasPendingAction, onDiscard }: { siteId: string; onDirtyChange?: (dirty: boolean) => void; hasPendingAction?: boolean; onDiscard?: () => void }) {
  const { data: site, mutate } = useSite(siteId)
  const [isPublic, setIsPublic] = useState(false)
  const [password, setPassword] = useState('')
  const [passwordEnabled, setPasswordEnabled] = useState(false)
  const [saving, setSaving] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const [isDirty, setIsDirty] = useState(false)
  const initialRef = useRef('')
  const hasInitialized = useRef(false)

  useEffect(() => {
    if (!site || hasInitialized.current) return
    setIsPublic(site.is_public ?? false)
    setPasswordEnabled(site.has_password ?? false)
    initialRef.current = JSON.stringify({ isPublic: site.is_public ?? false, passwordEnabled: site.has_password ?? false })
    hasInitialized.current = true
    setIsDirty(false)
  }, [site])

  // Track dirty state
  useEffect(() => {
    if (!initialRef.current) return
    const current = JSON.stringify({ isPublic, passwordEnabled })
    const dirty = current !== initialRef.current || password.length > 0
    setIsDirty(dirty)
    onDirtyChange?.(dirty)
  }, [isPublic, passwordEnabled, password, onDirtyChange])

  const handleSave = async () => {
    setSaving(true)
    try {
      await updateSite(siteId, {
        name: site?.name || '',
        is_public: isPublic,
        password: passwordEnabled ? password : undefined,
        clear_password: !passwordEnabled,
      })
      setPassword('')
      await mutate()
      initialRef.current = JSON.stringify({ isPublic, passwordEnabled })
      onDirtyChange?.(false)
      toast.success('Visibility updated')
    } catch {
      toast.error('Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const copyLink = () => {
    navigator.clipboard.writeText(`${APP_URL}/share/${siteId}`)
    setLinkCopied(true)
    toast.success('Link copied')
    setTimeout(() => setLinkCopied(false), 2000)
  }

  if (!site) return <div className="flex items-center justify-center py-12"><Spinner className="w-6 h-6 text-neutral-500" /></div>

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-white mb-1">Visibility</h3>
        <p className="text-sm text-neutral-400">Control who can see your analytics dashboard.</p>
      </div>

      {/* Public toggle */}
      <div className="flex items-center justify-between py-3 px-4 rounded-xl bg-neutral-800/30 border border-neutral-800">
        <div>
          <p className="text-sm font-medium text-white">Public Dashboard</p>
          <p className="text-xs text-neutral-400">Allow anyone with the link to view this dashboard.</p>
        </div>
        <Toggle checked={isPublic} onChange={() => setIsPublic(p => !p)} />
      </div>

      <AnimatePresence>
        {isPublic && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-4 overflow-hidden"
          >
            {/* Share link */}
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-1.5">Public Link</label>
              <div className="flex gap-2">
                <Input value={`${APP_URL}/share/${siteId}`} readOnly className="font-mono text-xs" />
                <Button onClick={copyLink} variant="secondary" className="shrink-0 text-sm gap-1.5">
                  {linkCopied ? <CheckCircle weight="bold" className="w-3.5 h-3.5" /> : <Copy weight="bold" className="w-3.5 h-3.5" />}
                  {linkCopied ? 'Copied' : 'Copy'}
                </Button>
              </div>
            </div>

            {/* Password protection */}
            <div className="flex items-center justify-between py-3 px-4 rounded-xl bg-neutral-800/30 border border-neutral-800">
              <div className="flex items-center gap-2">
                <Lock weight="bold" className="w-4 h-4 text-neutral-500" />
                <div>
                  <p className="text-sm font-medium text-white">Password Protection</p>
                  <p className="text-xs text-neutral-400">Require a password to view the public dashboard.</p>
                </div>
              </div>
              <Toggle checked={passwordEnabled} onChange={() => setPasswordEnabled(p => !p)} />
            </div>

            <AnimatePresence>
              {passwordEnabled && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <Input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder={site.has_password ? 'Leave empty to keep current password' : 'Set a password'}
                  />
                  {site.has_password && (
                    <button
                      type="button"
                      onClick={() => { setPasswordEnabled(false); setPassword('') }}
                      className="mt-2 text-xs font-medium text-red-400 hover:text-red-300 transition-colors"
                    >
                      Remove password protection
                    </button>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sticky save bar */}
      {isDirty && (
        <div className={`sticky bottom-0 -mx-6 -mb-6 px-6 py-3 backdrop-blur-md border-t flex items-center justify-between transition-colors ${
          hasPendingAction
            ? 'bg-rose-950/95 border-rose-800/50'
            : 'bg-neutral-950/90 border-neutral-800'
        }`}>
          <span className={`text-sm font-medium ${hasPendingAction ? 'text-rose-100' : 'text-neutral-400'}`}>
            {hasPendingAction ? 'Save or discard to continue' : 'Unsaved changes'}
          </span>
          <div className="flex items-center gap-2">
            {hasPendingAction && (
              <Button onClick={onDiscard} variant="secondary" className="text-sm border-rose-700/50 text-rose-200 hover:bg-rose-900/40">
                Discard
              </Button>
            )}
            <Button onClick={handleSave} variant="primary" disabled={saving} className="text-sm">
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
