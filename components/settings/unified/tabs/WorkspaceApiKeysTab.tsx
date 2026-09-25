'use client'

import { useState, useEffect, useCallback } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Button, Input, Select, Switcher, Checkbox, Toggle, toast } from '@ciphera-net/facet'
import { Plus, Trash, Copy, Check, Key, Warning } from '@phosphor-icons/react'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { SettingsErrorState } from '@/components/settings/SettingsErrorState'
import SettingsLoadingState from '@/components/settings/SettingsLoadingState'
import { SettingsPanel, PanelRow, PanelRows, EmptyRow } from '@/components/settings/panels'
import { StatusChip, type ChipTone } from '@/components/settings/StatusChip'
import { MastheadAction } from '@/components/settings/shell-slots'
import { cn } from '@/lib/utils'
import { DURATION_BASE, DURATION_FAST, EASE_APPLE } from '@/lib/motion'
import { formatDate, formatRelativeTime, formatDateTimeFull } from '@/lib/utils/formatDate'
import { useDisplayZone } from '@/lib/hooks/useDisplayZone'
import {
  listApiKeys,
  createApiKey,
  revokeApiKey,
  apiKeyStatus,
  type ApiKey,
  type ApiKeyExpiry,
} from '@/lib/api/api-keys'
import { listRoles, type Role } from '@/lib/api/roles'
import { listSites, type Site } from '@/lib/api/sites'
import { useTeamState } from '@/lib/hooks/useTeamState'

const EXPIRY_OPTIONS: { value: string; label: string }[] = [
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: '365', label: '1 year' },
]

// One shape for the three states apiKeyStatus() can return, so the row and
// any future consumer read the same tone and word for the same meaning.
const STATUS_CHIP: Record<'live' | 'expired' | 'revoked', { tone: ChipTone; label: string }> = {
  live: { tone: 'success', label: 'Active' },
  expired: { tone: 'neutral', label: 'Expired' },
  revoked: { tone: 'danger', label: 'Revoked' },
}

/**
 * The one-time token reveal.
 *
 * The server stores only a digest, so this is genuinely the only moment the
 * token is readable. The panel is deliberately a separate, standing panel and
 * does not auto-dismiss. A user who navigates away without copying has to
 * mint a new key.
 */
function TokenReveal({ token, onDone }: { token: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(token)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error("Couldn't copy the key. Select it and copy it by hand.")
    }
  }

  return (
    <SettingsPanel
      title="Your new API key"
      description="This is the only time it is shown. Copy it now. It cannot be recovered."
    >
      <div className="flex flex-col gap-3 p-5">
        <div className="flex items-start gap-2">
          <Warning className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" weight="fill" />
          <p className="text-sm text-foreground">
            Store this somewhere safe, like your secret manager. Pulse keeps only a hash of it, so we
            cannot show it to you again or recover it if it is lost.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <code className="flex-1 break-all border border-border bg-muted px-3 py-2 font-mono text-sm text-foreground">
            {token}
          </code>
          <Button variant="outline" size="sm" onClick={copy} aria-label="Copy API key">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          Send it as a header: <code className="font-mono">Authorization: Bearer …</code>, never in a URL.
          Keys are server-side only and do not work from browser JavaScript.
        </p>

        <div>
          <Button variant="outline" size="sm" onClick={onDone}>
            Done
          </Button>
        </div>
      </div>
    </SettingsPanel>
  )
}

export default function WorkspaceApiKeysTab() {
  const reducedMotion = useReducedMotion()
  const { zone } = useDisplayZone()
  const alone = useTeamState() === 'alone'
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [sites, setSites] = useState<Site[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [retrying, setRetrying] = useState(false)

  const [creating, setCreating] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [newToken, setNewToken] = useState<string | null>(null)
  const [revoking, setRevoking] = useState<ApiKey | null>(null)

  // Form state. site_ids is empty when scope_all_sites is on. The two are
  // mutually exclusive server-side (a CHECK constraint enforces it).
  const [name, setName] = useState('')
  const [roleId, setRoleId] = useState('')
  const [expiry, setExpiry] = useState<string>('90')
  const [allSites, setAllSites] = useState(false)
  const [siteIds, setSiteIds] = useState<string[]>([])

  const load = useCallback(async () => {
    setLoadError(false)
    try {
      const [keyRes, roleRes, siteRes] = await Promise.all([listApiKeys(), listRoles(), listSites()])
      setKeys(keyRes.api_keys)
      setRoles(roleRes.roles)
      setSites(siteRes)
    } catch {
      // Surface the failure rather than rendering an empty list that reads as
      // "you have no keys".
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const handleRetry = async () => {
    setRetrying(true)
    await load()
    setRetrying(false)
  }

  const resetForm = () => {
    setName('')
    setRoleId('')
    setExpiry('90')
    setAllSites(false)
    setSiteIds([])
  }

  const cancelCreate = () => {
    setCreating(false)
    resetForm()
  }

  const submit = async () => {
    if (!name.trim()) {
      toast.error('Give the key a name so you can recognise it later.')
      return
    }
    if (!roleId) {
      toast.error('Choose a role. It decides what the key can read.')
      return
    }
    if (!allSites && siteIds.length === 0) {
      toast.error('Select at least one site, or turn on access to all sites.')
      return
    }

    setSubmitting(true)
    try {
      const res = await createApiKey({
        name: name.trim(),
        role_id: roleId,
        expires_in_days: Number(expiry) as ApiKeyExpiry,
        scope_all_sites: allSites,
        site_ids: allSites ? [] : siteIds,
      })
      setNewToken(res.token)
      setCreating(false)
      resetForm()
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't create the API key. Try again.")
    } finally {
      setSubmitting(false)
    }
  }

  const confirmRevoke = async () => {
    if (!revoking) return
    try {
      await revokeApiKey(revoking.id)
      toast.success('The key is revoked. It stops working immediately.')
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't revoke the key. Try again.")
    } finally {
      setRevoking(null)
    }
  }

  const toggleSite = (id: string) => {
    setSiteIds((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]))
  }

  if (loading) return <SettingsLoadingState rows={4} />

  if (loadError) {
    return (
      <SettingsErrorState
        title="Couldn't load your API keys"
        message="This is usually temporary. Try again in a moment."
        onRetry={handleRetry}
        retrying={retrying}
      />
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* The tab's one orange: the primary CTA, portaled into the masthead.
          Hidden while the inline form is open so Create key is the only
          solid-orange element in view. */}
      {!creating && (
        <MastheadAction>
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            New key
          </Button>
        </MastheadAction>
      )}

      {newToken && <TokenReveal token={newToken} onDone={() => setNewToken(null)} />}

      <SettingsPanel
        title="API keys"
        description="Read your analytics programmatically. A key carries the permissions of the role you assign it."
      >
        {creating && (
          <div className="border-b border-border">
            <PanelRows>
              <PanelRow label="Name" htmlFor="api-key-name">
                <Input
                  id="api-key-name"
                  placeholder="Grafana dashboard"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={64}
                />
              </PanelRow>

              <PanelRow
                label="Role"
                htmlFor="api-key-role"
                caption="The key can do exactly what this role can. Roles with owner-only permissions cannot be used."
              >
                <Select
                  id="api-key-role"
                  value={roleId}
                  onChange={(v) => setRoleId(v)}
                  options={roles.map((r) => ({ value: r.id, label: r.name }))}
                  placeholder="Choose a role"
                  aria-label="Role"
                  className="w-full"
                />
              </PanelRow>

              <PanelRow
                label="Expires after"
                caption="Keys always expire. Rotate by creating the replacement first, then revoking this one."
              >
                <Switcher
                  size="sm"
                  tone="solid"
                  aria-label="Expires after"
                  options={EXPIRY_OPTIONS}
                  value={expiry}
                  onChange={setExpiry}
                />
              </PanelRow>

              <PanelRow
                label="All sites"
                caption={alone ? 'Every site you have, including ones you add later.' : 'Every site in this team, including ones you add later.'}
                control={<Toggle checked={allSites} onChange={() => setAllSites((v) => !v)} />}
              />

              {!allSites && (
                <PanelRow label="Sites" caption="Choose which sites this key can read.">
                  {sites.length === 0 ? (
                    <p className="text-sm text-muted-foreground">You have no sites yet.</p>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      {sites.map((s) => (
                        <Checkbox
                          key={s.id}
                          checked={siteIds.includes(s.id)}
                          onChange={() => toggleSite(s.id)}
                          label={<code className="font-mono">{s.domain}</code>}
                        />
                      ))}
                    </div>
                  )}
                </PanelRow>
              )}
            </PanelRows>

            <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
              <Button variant="ghost" size="sm" onClick={cancelCreate} disabled={submitting}>
                Cancel
              </Button>
              <Button size="sm" onClick={submit} disabled={submitting}>
                {submitting ? 'Creating…' : 'Create key'}
              </Button>
            </div>
          </div>
        )}

        {keys.length === 0 && !creating ? (
          <EmptyRow
            icon={<Key />}
            title="No API keys yet"
            caption="Create one to pull your analytics into a dashboard, a warehouse, or a scheduled report."
          />
        ) : (
          <PanelRows>
            {/* M5: a row entering (a fresh key) or leaving the list rises in /
                fades out rather than popping, matching the house AnimatePresence
                device. `initial={false}` keeps the keys already on the page from
                playing an entrance on first load; only a later change animates. */}
            <AnimatePresence initial={false}>
              {keys.map((key) => {
                const status = apiKeyStatus(key)
                const chip = STATUS_CHIP[status]
                // P7: a revoked key recedes. Its name and meta dim to opacity-60;
                // the chip stays at full strength so "Revoked" itself never fades.
                const receded = status === 'revoked'
                return (
                  <motion.div
                    key={key.id}
                    data-testid={`api-key-row-${key.id}`}
                    layout={!reducedMotion}
                    initial={reducedMotion ? false : { opacity: 0, y: 8 }}
                    animate={
                      reducedMotion
                        ? undefined
                        : { opacity: 1, y: 0, transition: { duration: DURATION_BASE, ease: EASE_APPLE } }
                    }
                    exit={
                      reducedMotion
                        ? undefined
                        : { opacity: 0, y: 4, transition: { duration: DURATION_FAST, ease: EASE_APPLE } }
                    }
                  >
                    <PanelRow
                      label={
                        <span
                          className={cn(
                            'min-w-0 truncate',
                            receded && 'opacity-60 transition-opacity duration-fast ease-apple motion-reduce:transition-none',
                          )}
                        >
                          {key.name}
                        </span>
                      }
                      caption={
                        // Grouped into two clauses, each its own inline-flex span
                        // with its separators inside it, so a narrow row wraps
                        // between clauses and never strands a lone "·" at a line
                        // break (the pre-existing bug: "...1 site ·" cut off, then
                        // "Never used ..." starting a fresh line).
                        <span
                          className={cn(
                            'flex flex-wrap gap-x-2 gap-y-0.5',
                            receded && 'opacity-60 transition-opacity duration-fast ease-apple motion-reduce:transition-none',
                          )}
                        >
                          <span className="inline-flex items-center gap-x-2">
                            <code className="font-mono">
                              {key.key_prefix}_…{key.key_last4}
                            </code>
                            <span aria-hidden="true">·</span>
                            <span>
                              {key.scope_all_sites ? 'All sites' : `${key.site_ids.length} site${key.site_ids.length === 1 ? '' : 's'}`}
                            </span>
                          </span>
                          <span className="inline-flex items-center gap-x-2">
                            <span aria-hidden="true">·</span>
                            {/* null means never used. Say so, rather than showing a
                                placeholder date that reads as real activity. */}
                            <span title={key.last_used_at ? formatDateTimeFull(new Date(key.last_used_at), zone) : undefined}>
                              {key.last_used_at ? `Last used ${formatRelativeTime(key.last_used_at)}` : 'Never used'}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>
                              {status === 'revoked' && key.revoked_at
                                ? `Revoked ${formatDate(new Date(key.revoked_at), zone)}`
                                : `Expires ${formatDate(new Date(key.expires_at), zone)}`}
                            </span>
                          </span>
                        </span>
                      }
                      control={
                        <div className="flex items-center gap-3">
                          <StatusChip tone={chip.tone} dot>{chip.label}</StatusChip>
                          {/* Reserve the action column so rows align whether or
                              not a key can still be revoked. */}
                          <div className="flex w-8 shrink-0 justify-end">
                            {status !== 'revoked' && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                onClick={() => setRevoking(key)}
                                aria-label={`Revoke ${key.name}`}
                              >
                                <Trash weight="bold" className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </div>
                      }
                    />
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </PanelRows>
        )}
      </SettingsPanel>

      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(open) => { if (!open) setRevoking(null) }}
        title="Revoke this API key?"
        description={
          revoking
            ? `"${revoking.name}" stops working immediately, and anything using it starts failing. This cannot be undone. You would need to create a new key.`
            : ''
        }
        confirmLabel="Revoke key"
        variant="danger"
        onConfirm={confirmRevoke}
      />
    </div>
  )
}
