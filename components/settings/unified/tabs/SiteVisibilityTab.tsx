'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Button, Input, Toggle, toast, Spinner, getAuthErrorMessage } from '@ciphera-net/facet'
import { Copy, CheckCircle, Lock } from '@phosphor-icons/react'
import { AnimatePresence, motion } from 'framer-motion'
import { useSite } from '@/lib/swr/dashboard'
import { updateSite } from '@/lib/api/sites'
import { env } from '@/lib/env'
import SettingsSaveBar from '@/components/settings/SettingsSaveBar'
import { StatusChip } from '@/components/settings/StatusChip'
import { SettingsErrorState } from '@/components/settings/SettingsErrorState'
import { useCan } from '@/lib/auth/permissions'

// Zod-validated URL, guaranteed to be a `string` at runtime.
const APP_URL = env.NEXT_PUBLIC_APP_URL

export default function SiteVisibilityTab({ siteId }: { siteId: string }) {
  const canEdit = useCan('sites.edit')
  const { data: site, error, mutate } = useSite(siteId)
  const [isPublic, setIsPublic] = useState(false)
  const [password, setPassword] = useState('')
  const [passwordEnabled, setPasswordEnabled] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  // Set on a save attempt that would persist an empty password (protection on,
  // no stored password, blank field) — drives the inline validation message.
  const [pwError, setPwError] = useState(false)
  // In-flight guard for the updateSite mutation: disables the toggles/field and
  // prevents a second submit while a save is running.
  const [saving, setSaving] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const initialRef = useRef('')
  const hasInitialized = useRef(false)

  useEffect(() => {
    if (!site || hasInitialized.current) return
    setIsPublic(site.is_public ?? false)
    setPasswordEnabled(site.has_password ?? false)
    initialRef.current = JSON.stringify({ isPublic: site.is_public ?? false, passwordEnabled: site.has_password ?? false })
    hasInitialized.current = true
  }, [site])

  // Track dirty state
  const isDirty = initialRef.current
    ? JSON.stringify({ isPublic, passwordEnabled }) !== initialRef.current || password.length > 0
    : false

  const handleDiscard = () => {
    if (!initialRef.current) return
    const snap = JSON.parse(initialRef.current)
    setIsPublic(snap.isPublic)
    setPasswordEnabled(snap.passwordEnabled)
    setPassword('')
    setPwError(false)
  }

  const handleSave = useCallback(async () => {
    // Enabling protection on a site with no stored password and a blank field
    // would persist an empty password. Block the save with an inline message;
    // reject so the save bar keeps "Unsaved changes" instead of flashing saved.
    if (passwordEnabled && !site!.has_password && password.trim().length === 0) {
      setPwError(true)
      toast.error('Enter a password to enable protection')
      throw new Error('password-required')
    }
    setSaving(true)
    try {
      await updateSite(siteId, {
        name: site!.name,
        is_public: isPublic,
        password: passwordEnabled ? password : undefined,
        clear_password: !passwordEnabled,
      })
      initialRef.current = JSON.stringify({ isPublic, passwordEnabled })
      setPassword('')
      setPwError(false)
      await mutate()
      toast.success('Visibility updated')
    } catch (err) {
      toast.error(getAuthErrorMessage(err as Error) || 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }, [siteId, site, isPublic, passwordEnabled, password, mutate])

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${APP_URL}/share/${siteId}`)
      setLinkCopied(true)
      toast.success('Link copied')
      setTimeout(() => setLinkCopied(false), 2000)
    } catch {
      toast.error("Couldn't copy link")
    }
  }

  const handleRetry = useCallback(async () => {
    setRetrying(true)
    try {
      await mutate()
    } finally {
      setRetrying(false)
    }
  }, [mutate])

  // Distinguish loading from a failed fetch: a server error must surface a retry,
  // not fall through to an infinite spinner.
  if (!site) {
    if (error) {
      return (
        <SettingsErrorState
          variant="card"
          message={getAuthErrorMessage(error as Error) || undefined}
          onRetry={handleRetry}
          retrying={retrying}
        />
      )
    }
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner className="w-6 h-6 text-neutral-500" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-white mb-1">Visibility</h3>
        <p className="text-sm text-neutral-400">Control who can see your analytics dashboard.</p>
      </div>

      {/* Public toggle */}
      <div className="flex items-center justify-between py-3 px-4 rounded-none bg-neutral-800/30 border border-neutral-800">
        <div>
          <p className="text-sm font-medium text-white">Public Dashboard</p>
          <p className="text-xs text-neutral-500">Allow anyone with the link to view this dashboard.</p>
        </div>
        <Toggle checked={isPublic} onChange={() => setIsPublic(p => !p)} disabled={!canEdit || saving} />
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
            <div className="p-4 rounded-none border border-neutral-800 bg-neutral-800/30">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-micro-label uppercase text-neutral-400">Public Link</label>
                {/* Reflects the SAVED server state, not the pending toggle: the
                    link only resolves once the change is saved. */}
                {site.is_public ? (
                  <StatusChip tone="success" dot pulse>Live</StatusChip>
                ) : (
                  <StatusChip tone="warning">Not saved yet</StatusChip>
                )}
              </div>
              <div className="flex gap-2">
                <Input value={`${APP_URL}/share/${siteId}`} readOnly className="font-mono text-xs" />
                <Button onClick={copyLink} variant="secondary" className="shrink-0 text-sm gap-1.5">
                  {linkCopied ? <CheckCircle weight="bold" className="w-3.5 h-3.5" /> : <Copy weight="bold" className="w-3.5 h-3.5" />}
                  {linkCopied ? 'Copied' : 'Copy'}
                </Button>
              </div>
            </div>

            {/* Password protection */}
            <div className="flex items-center justify-between py-3 px-4 rounded-none bg-neutral-800/30 border border-neutral-800">
              <div className="flex items-center gap-2">
                <Lock weight="bold" className="w-4 h-4 text-neutral-500" />
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-white">Password Protection</p>
                    {site.has_password && <StatusChip tone="success">Password set</StatusChip>}
                  </div>
                  <p className="text-xs text-neutral-500">Require a password to view the public dashboard.</p>
                </div>
              </div>
              <Toggle
                checked={passwordEnabled}
                onChange={() => { setPasswordEnabled(p => !p); setPwError(false) }}
                disabled={!canEdit || saving}
              />
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
                    onChange={e => { setPassword(e.target.value); if (pwError) setPwError(false) }}
                    placeholder={site.has_password ? 'Leave empty to keep current password' : 'Set a password'}
                    disabled={saving}
                    aria-invalid={pwError || undefined}
                  />
                  {pwError && (
                    <p className="mt-1.5 text-xs text-red-400">Enter a password to enable protection.</p>
                  )}
                  {site.has_password && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-2 text-red-400 hover:text-red-300"
                      onClick={() => { setPasswordEnabled(false); setPassword(''); setPwError(false) }}
                      disabled={saving}
                    >
                      Remove password protection
                    </Button>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {canEdit && (
        <SettingsSaveBar
          isDirty={isDirty}
          onSave={handleSave}
          onDiscard={handleDiscard}
        />
      )}
    </div>
  )
}
