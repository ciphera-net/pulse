'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Button,
  Input,
  InputGroup,
  InputGroupInput,
  InputGroupButton,
  Toggle,
  toast,
  getAuthErrorMessage,
} from '@ciphera-net/facet'
import { Copy, CheckCircle, Lock } from '@phosphor-icons/react'
import { useSite } from '@/lib/swr/dashboard'
import { updateSite } from '@/lib/api/sites'
import { env } from '@/lib/env'
import SettingsSaveBar from '@/components/settings/SettingsSaveBar'
import SettingsLoadingState from '@/components/settings/SettingsLoadingState'
import { StatusChip } from '@/components/settings/StatusChip'
import { SettingsErrorState } from '@/components/settings/SettingsErrorState'
import { SettingsPanel, PanelRow, PanelRows } from '@/components/settings/panels'
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
    return <SettingsLoadingState rows={3} />
  }

  return (
    <div className="space-y-8">
      {/* ONE panel — public toggle, share link, and password all live as ruled
          rows in the same frame (spec §6: no lone toggle in a void). */}
      <SettingsPanel kicker="Visibility" description="Control who can see your analytics dashboard.">
        <PanelRows>
          <PanelRow
            label="Public dashboard"
            caption="Allow anyone with the link to view this dashboard."
            control={
              <Toggle
                checked={isPublic}
                onChange={() => setIsPublic(p => !p)}
                disabled={!canEdit || saving}
                aria-label="Public dashboard"
              />
            }
          />

          {isPublic && (
            <PanelRow
              label="Public link"
              htmlFor="site-public-link"
              control={
                /* Reflects the SAVED server state, not the pending toggle: the
                   link only resolves once the change is saved. */
                site.is_public
                  ? <StatusChip tone="success" dot pulse>Live</StatusChip>
                  : <StatusChip tone="warning">Not saved yet</StatusChip>
              }
            >
              <InputGroup>
                <InputGroupInput
                  id="site-public-link"
                  value={`${APP_URL}/share/${siteId}`}
                  readOnly
                  className="font-mono text-xs"
                />
                <InputGroupButton
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={copyLink}
                  aria-label="Copy public link"
                >
                  {linkCopied
                    ? <CheckCircle weight="bold" className="h-3.5 w-3.5" />
                    : <Copy weight="bold" className="h-3.5 w-3.5" />}
                  <span className="ml-1">{linkCopied ? 'Copied' : 'Copy'}</span>
                </InputGroupButton>
              </InputGroup>
            </PanelRow>
          )}

          {isPublic && (
            <PanelRow
              label={
                <span className="flex items-center gap-2">
                  <Lock weight="bold" className="h-4 w-4 text-muted-foreground" />
                  Password protection
                </span>
              }
              caption="Require a password to view the public dashboard."
              control={
                <Toggle
                  checked={passwordEnabled}
                  onChange={() => { setPasswordEnabled(p => !p); setPwError(false) }}
                  disabled={!canEdit || saving}
                  aria-label="Password protection"
                />
              }
            >
              {site.has_password && <StatusChip tone="success">Password set</StatusChip>}
            </PanelRow>
          )}

          {isPublic && passwordEnabled && (
            <PanelRow
              label="Password"
              htmlFor="site-password"
              caption={site.has_password ? 'Leave empty to keep the current password.' : 'Choose a password viewers must enter.'}
            >
              <Input
                id="site-password"
                type="password"
                value={password}
                onChange={e => { setPassword(e.target.value); if (pwError) setPwError(false) }}
                placeholder={site.has_password ? 'Leave empty to keep current password' : 'Set a password'}
                disabled={saving}
                aria-invalid={pwError || undefined}
                className={pwError ? 'border-destructive focus:border-destructive' : undefined}
              />
              {pwError && (
                <p className="mt-1.5 text-xs text-destructive">Enter a password to enable protection.</p>
              )}
              {site.has_password && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => { setPasswordEnabled(false); setPassword(''); setPwError(false) }}
                  disabled={saving}
                >
                  Remove password protection
                </Button>
              )}
            </PanelRow>
          )}
        </PanelRows>
      </SettingsPanel>

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
