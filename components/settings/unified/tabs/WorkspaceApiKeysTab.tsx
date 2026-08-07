'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button, Input, Select, Checkbox, Spinner, toast } from '@ciphera-net/facet'
import { Plus, Trash, Copy, Check, Key, Warning } from '@phosphor-icons/react'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { SettingsPanel, EmptyRow } from '@/components/settings/panels'
import { StatusChip } from '@/components/settings/StatusChip'
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

const EXPIRY_OPTIONS: { value: string; label: string }[] = [
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: '365', label: '1 year' },
]

/**
 * The one-time token reveal.
 *
 * The server stores only a digest, so this is genuinely the only moment the
 * token is readable. The panel is deliberately loud and does not auto-dismiss —
 * a user who navigates away without copying has to mint a new key.
 */
function TokenReveal({ token, onDone }: { token: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(token)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Could not copy to clipboard — select the token and copy it manually.')
    }
  }

  return (
    <SettingsPanel
      kicker="Your new API key"
      description="This is the only time it will be shown. Copy it now — it cannot be recovered."
    >
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-start gap-2 text-amber-400">
          <Warning className="w-4 h-4 mt-0.5 shrink-0" weight="fill" />
          <p className="text-sm">
            Store this somewhere safe, like your secret manager. Pulse keeps only a hash of it, so we
            cannot show it to you again or recover it if it is lost.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <code className="flex-1 px-3 py-2 bg-black/40 border border-white/10 font-mono text-sm break-all">
            {token}
          </code>
          <Button variant="secondary" onClick={copy} aria-label="Copy API key">
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          </Button>
        </div>

        <p className="text-xs text-neutral-500">
          Send it as a header: <code className="font-mono">Authorization: Bearer …</code> — never in a URL.
          Keys are server-side only and will not work from browser JavaScript.
        </p>

        <div>
          <Button variant="secondary" onClick={onDone}>
            I&apos;ve saved it
          </Button>
        </div>
      </div>
    </SettingsPanel>
  )
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function WorkspaceApiKeysTab() {
  const [keys, setKeys] = useState<ApiKey[] | null>(null)
  const [roles, setRoles] = useState<Role[]>([])
  const [sites, setSites] = useState<Site[]>([])
  const [creating, setCreating] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [newToken, setNewToken] = useState<string | null>(null)
  const [revoking, setRevoking] = useState<ApiKey | null>(null)

  // * Form state. site_ids is empty when scope_all_sites is on — the two are
  // * mutually exclusive server-side (a CHECK constraint enforces it).
  const [name, setName] = useState('')
  const [roleId, setRoleId] = useState('')
  const [expiry, setExpiry] = useState<string>('90')
  const [allSites, setAllSites] = useState(false)
  const [siteIds, setSiteIds] = useState<string[]>([])

  const load = useCallback(async () => {
    try {
      const [keyRes, roleRes, siteRes] = await Promise.all([listApiKeys(), listRoles(), listSites()])
      setKeys(keyRes.api_keys)
      setRoles(roleRes.roles)
      setSites(siteRes)
    } catch {
      // * Surface the failure rather than rendering an empty list that reads as
      // * "you have no keys".
      setKeys(null)
      toast.error('Could not load API keys.')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const resetForm = () => {
    setName('')
    setRoleId('')
    setExpiry('90')
    setAllSites(false)
    setSiteIds([])
  }

  const submit = async () => {
    if (!name.trim()) {
      toast.error('Give the key a name so you can recognise it later.')
      return
    }
    if (!roleId) {
      toast.error('Choose a role. It decides what the key is allowed to read.')
      return
    }
    if (!allSites && siteIds.length === 0) {
      toast.error('Select at least one site, or grant access to all sites.')
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
      toast.error(err instanceof Error ? err.message : 'Could not create the API key.')
    } finally {
      setSubmitting(false)
    }
  }

  const confirmRevoke = async () => {
    if (!revoking) return
    try {
      await revokeApiKey(revoking.id)
      toast.success('API key revoked. It stops working immediately.')
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not revoke the key.')
    } finally {
      setRevoking(null)
    }
  }

  const toggleSite = (id: string) => {
    setSiteIds((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]))
  }

  if (keys === null) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {newToken && <TokenReveal token={newToken} onDone={() => setNewToken(null)} />}

      <SettingsPanel
        kicker="API keys"
        description="Read your analytics programmatically. Keys are server-side only and carry the permissions of the role you assign."
        action={
          !creating && (
            <Button variant="secondary" onClick={() => setCreating(true)}>
              <Plus className="w-4 h-4 mr-1.5" />
              New key
            </Button>
          )
        }
      >
        {creating && (
          <div className="flex flex-col gap-4 p-4 border-b border-white/[0.06]">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Name</span>
              <Input
                placeholder="Grafana dashboard"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={64}
              />
            </label>

            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Role</span>
              <Select
                value={roleId}
                onChange={(v) => setRoleId(v)}
                options={roles.map((r) => ({ value: r.id, label: r.name }))}
                placeholder="Choose a role"
                aria-label="Role"
              />
            </div>
            <p className="-mt-2 text-xs text-neutral-500">
              The key can do exactly what this role can. Roles with owner-only permissions cannot be used.
            </p>

            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Expires after</span>
              <Select
                value={expiry}
                onChange={(v) => setExpiry(v)}
                options={EXPIRY_OPTIONS}
                aria-label="Expires after"
              />
            </div>
            <p className="-mt-2 text-xs text-neutral-500">
              Keys always expire. Rotate by creating the replacement first, then revoking this one.
            </p>

            <div className="flex flex-col gap-2">
              <Checkbox
                checked={allSites}
                onChange={() => setAllSites((v) => !v)}
                label="Grant access to all sites in this workspace"
              />
              {!allSites && (
                <div className="flex flex-col gap-1.5 pl-1">
                  {sites.map((s) => (
                    <Checkbox
                      key={s.id}
                      checked={siteIds.includes(s.id)}
                      onChange={() => toggleSite(s.id)}
                      label={s.domain}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button onClick={submit} disabled={submitting}>
                {submitting ? 'Creating…' : 'Create key'}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setCreating(false)
                  resetForm()
                }}
              >
                Cancel
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
          <div className="flex flex-col">
            {keys.map((key) => {
              const status = apiKeyStatus(key)
              return (
                <div
                  key={key.id}
                  className="flex items-center justify-between gap-4 px-4 py-3 border-b border-white/[0.06] last:border-b-0"
                >
                  <div className="flex flex-col gap-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-neutral-200 truncate">{key.name}</span>
                      {status === 'live' && <StatusChip tone="success" dot>Active</StatusChip>}
                      {status === 'expired' && <StatusChip tone="warning">Expired</StatusChip>}
                      {status === 'revoked' && <StatusChip tone="danger">Revoked</StatusChip>}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-neutral-500">
                      <code className="font-mono">
                        {key.key_prefix}_…{key.key_last4}
                      </code>
                      <span>·</span>
                      <span>{key.scope_all_sites ? 'All sites' : `${key.site_ids.length} site${key.site_ids.length === 1 ? '' : 's'}`}</span>
                      <span>·</span>
                      {/* * null means never used — say so, rather than showing a
                          * placeholder date that reads as real activity. */}
                      <span>
                        {key.last_used_at ? `Last used ${formatDate(key.last_used_at)}` : 'Never used'}
                      </span>
                      <span>·</span>
                      <span>
                        {status === 'revoked' && key.revoked_at
                          ? `Revoked ${formatDate(key.revoked_at)}`
                          : `Expires ${formatDate(key.expires_at)}`}
                      </span>
                    </div>
                  </div>

                  {status !== 'revoked' && (
                    <Button
                      variant="ghost"
                      onClick={() => setRevoking(key)}
                      aria-label={`Revoke ${key.name}`}
                    >
                      <Trash className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </SettingsPanel>

      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(open) => { if (!open) setRevoking(null) }}
        title="Revoke this API key?"
        description={
          revoking
            ? `"${revoking.name}" stops working immediately, and anything using it will start failing. This cannot be undone — you would need to create a new key.`
            : ''
        }
        confirmLabel="Revoke key"
        variant="danger"
        onConfirm={confirmRevoke}
      />
    </div>
  )
}
