'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { EASE_APPLE, SPRING } from '@/lib/motion'
import { cn } from '@/lib/utils'
import {
  Button,
  Input,
  Select,
  Checkbox,
  RailGrid,
  RailGridTile,
  Spinner,
  toast,
  getAuthErrorMessage,
} from '@ciphera-net/facet'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  CaretDown,
  Plus,
  Trash,
  Crown,
  ShieldCheck,
  UserCircle,
  Lock,
  Users,
  Pencil,
  Check,
  X,
} from '@phosphor-icons/react'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { SettingsPanel, EmptyRow } from '@/components/settings/panels'
import { MastheadAction } from '@/components/settings/shell-slots'
import { StatusChip } from '@/components/settings/StatusChip'
import { SettingsErrorState } from '@/components/settings/SettingsErrorState'
import { useAuth } from '@/lib/auth/context'
import { useCan } from '@/lib/auth/permissions'
import {
  listRoles,
  listPermissionGroups,
  createRole,
  updateRole,
  deleteRole,
  type Role,
  type PermissionGroup,
} from '@/lib/api/roles'
import { useSites } from '@/lib/swr/sites'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// Permissions that only Owner can ever hold
const OWNER_ONLY_PERMS = new Set(['roles.manage', 'org.delete'])

// ─── Role color badge ─────────────────────────────────────────────────────────

function ColorDot({ color }: { color: string | null }) {
  // No user-chosen color: fall back to a neutral token dot, not a raw hex.
  if (!color) {
    return <span className="inline-block w-2 h-2 rounded-full shrink-0 bg-muted-foreground" />
  }
  return (
    <span
      className="inline-block w-2 h-2 rounded-full shrink-0"
      style={{ background: color }}
    />
  )
}

// ─── Built-in role icon (neutral — no decorative accent, per §2.3 budget) ──────

function RoleIcon({ slug }: { slug: string }) {
  const className = 'w-4 h-4 text-muted-foreground shrink-0'
  if (slug === 'owner') return <Crown weight="fill" className={className} />
  if (slug === 'admin') return <ShieldCheck weight="fill" className={className} />
  if (slug === 'member') return <UserCircle weight="fill" className={className} />
  return <Users weight="regular" className={className} />
}

// ─── Permission matrix (Checkbox grid grouped by domain in RailGrid bands) ─────

interface PermissionMatrixProps {
  groups: PermissionGroup[]
  idPrefix: string
  isChecked: (perm: string) => boolean
  isDisabled: (perm: string) => boolean
  /** Whether to surface the "Owner only" chip on the owner-locked permissions. */
  showOwnerBadge: (perm: string) => boolean
  onToggle: (perm: string) => void
}

function PermissionMatrix({
  groups,
  idPrefix,
  isChecked,
  isDisabled,
  showOwnerBadge,
  onToggle,
}: PermissionMatrixProps) {
  return (
    <RailGrid minTileWidth={260}>
      {groups.map((group) => (
        <RailGridTile key={group.key} className="space-y-3">
          <p className="font-mono text-micro-label uppercase text-muted-foreground">
            {group.label}
          </p>
          <div className="space-y-3">
            {group.permissions.map((pi) => {
              const checked = isChecked(pi.permission)
              const disabled = isDisabled(pi.permission)
              const dimmed = disabled && !checked
              return (
                <Checkbox
                  key={pi.permission}
                  id={`${idPrefix}-${pi.permission}`}
                  checked={checked}
                  disabled={disabled}
                  onChange={() => onToggle(pi.permission)}
                  label={
                    <span className="flex flex-col gap-0.5">
                      <span className="inline-flex items-center gap-2">
                        <span className={cn('text-sm', dimmed ? 'text-muted-foreground' : 'text-foreground')}>
                          {pi.label}
                        </span>
                        {showOwnerBadge(pi.permission) && (
                          <StatusChip tone="neutral">Owner only</StatusChip>
                        )}
                      </span>
                      <span className="text-xs text-muted-foreground">{pi.description}</span>
                    </span>
                  }
                />
              )
            })}
          </div>
        </RailGridTile>
      ))}
    </RailGrid>
  )
}

// ─── Create role form ─────────────────────────────────────────────────────────

interface CreateRoleFormProps {
  existingRoles: Role[]
  permissionGroups: PermissionGroup[]
  onCreated: (role: Role) => void
  onCancel: () => void
}

function CreateRoleForm({
  existingRoles,
  permissionGroups,
  onCreated,
  onCancel,
}: CreateRoleFormProps) {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const [templateSlug, setTemplateSlug] = useState('member')
  const [saving, setSaving] = useState(false)

  // Derive initial permissions from the chosen template
  const templateRole = existingRoles.find((r) => r.slug === templateSlug)
  const initialPerms = templateRole
    ? templateRole.permissions.filter((p) => !OWNER_ONLY_PERMS.has(p))
    : []
  const [permissions, setPermissions] = useState<string[]>(initialPerms)

  // Re-sync permissions when template changes
  useEffect(() => {
    const t = existingRoles.find((r) => r.slug === templateSlug)
    setPermissions(t ? t.permissions.filter((p) => !OWNER_ONLY_PERMS.has(p)) : [])
  }, [templateSlug, existingRoles])

  const handleNameChange = (v: string) => {
    setName(v)
    if (!slugEdited) setSlug(slugify(v))
  }

  const handleSlugChange = (v: string) => {
    setSlugEdited(true)
    setSlug(slugify(v))
  }

  const togglePerm = (perm: string) => {
    if (OWNER_ONLY_PERMS.has(perm)) return
    setPermissions((prev) =>
      prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]
    )
  }

  const handleSave = async () => {
    if (!name.trim() || !slug.trim()) return
    setSaving(true)
    try {
      const role = await createRole({ name: name.trim(), slug, permissions })
      toast.success(`Role "${role.name}" created`)
      onCreated(role)
    } catch (err) {
      toast.error(getAuthErrorMessage(err as Error) || 'Failed to create role')
    } finally {
      setSaving(false)
    }
  }

  const templateOptions = existingRoles
    .filter((r) => r.slug !== 'owner')
    .map((r) => ({ value: r.slug, label: r.name }))

  return (
    <SettingsPanel kicker="New custom role">
      <div className="space-y-5 p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="new-role-name" className="block text-sm font-medium text-foreground">
              Name
            </label>
            <Input
              id="new-role-name"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g. Analyst"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="new-role-slug" className="block text-sm font-medium text-foreground">
              Slug
            </label>
            <Input
              id="new-role-slug"
              value={slug}
              onChange={(e) => handleSlugChange(e.target.value)}
              placeholder="e.g. analyst"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="new-role-template" className="block text-sm font-medium text-foreground">
            Copy permissions from
          </label>
          <Select
            id="new-role-template"
            value={templateSlug}
            onChange={setTemplateSlug}
            options={templateOptions}
            placeholder="Select a role"
            aria-label="Copy permissions from"
          />
        </div>

        {/* Permission matrix for the new role */}
        <PermissionMatrix
          groups={permissionGroups}
          idPrefix="new"
          isChecked={(perm) => !OWNER_ONLY_PERMS.has(perm) && permissions.includes(perm)}
          isDisabled={(perm) => OWNER_ONLY_PERMS.has(perm)}
          showOwnerBadge={(perm) => OWNER_ONLY_PERMS.has(perm)}
          onToggle={togglePerm}
        />

        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button onClick={onCancel} variant="secondary">
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            className="gap-1.5"
            disabled={saving || !name.trim() || !slug.trim()}
          >
            <Check weight="bold" className="w-3.5 h-3.5" />
            {saving ? 'Creating…' : 'Create role'}
          </Button>
        </div>
      </div>
    </SettingsPanel>
  )
}

// ─── Role row (ruled row expanding in place) ───────────────────────────────────

interface RoleRowProps {
  role: Role
  permissionGroups: PermissionGroup[]
  canManage: boolean
  onUpdated: (role: Role) => void
  onDeleted: (roleId: string) => void
}

function RoleRow({
  role,
  permissionGroups,
  canManage,
  onUpdated,
  onDeleted,
}: RoleRowProps) {
  const [expanded, setExpanded] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState(role.name)
  const [permissions, setPermissions] = useState<string[]>(role.permissions)
  const [siteScoped, setSiteScoped] = useState(role.site_scoped ?? false)
  const [siteIds, setSiteIds] = useState<string[]>(role.site_ids ?? [])
  const [saving, setSaving] = useState(false)
  const [savingIndicator, setSavingIndicator] = useState(false)
  const [savedIndicator, setSavedIndicator] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { sites } = useSites()

  // Clear any pending timers on unmount so we never set state after teardown.
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      if (savedTimer.current) clearTimeout(savedTimer.current)
    }
  }, [])

  const isOwner = role.slug === 'owner'

  // Auto-save permissions (and site-scoping) with debounce
  const scheduleSave = useCallback(
    (nextPerms: string[], nextSiteScoped: boolean, nextSiteIds: string[]) => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      if (savedTimer.current) clearTimeout(savedTimer.current)
      setSavedIndicator(false)
      saveTimer.current = setTimeout(async () => {
        setSavingIndicator(true)
        try {
          await updateRole(role.id, {
            name: role.name,
            permissions: nextPerms,
            site_scoped: nextSiteScoped,
            site_ids: nextSiteScoped ? nextSiteIds : [],
          })
          // Subtle success confirmation, mirroring the explicit name-save toast.
          setSavedIndicator(true)
          savedTimer.current = setTimeout(() => setSavedIndicator(false), 2000)
        } catch (err) {
          toast.error(getAuthErrorMessage(err as Error) || 'Failed to save permissions')
          // Revert
          setPermissions(role.permissions)
          setSiteScoped(role.site_scoped ?? false)
          setSiteIds(role.site_ids ?? [])
        } finally {
          setSavingIndicator(false)
        }
      }, 400)
    },
    [role.id, role.name, role.permissions, role.site_scoped, role.site_ids]
  )

  const togglePerm = (perm: string) => {
    if (!canManage || isOwner || OWNER_ONLY_PERMS.has(perm)) return
    const next = permissions.includes(perm)
      ? permissions.filter((p) => p !== perm)
      : [...permissions, perm]
    setPermissions(next)
    onUpdated({ ...role, permissions: next })
    scheduleSave(next, siteScoped, siteIds)
  }

  const toggleSiteScoped = () => {
    if (!canManage || role.is_builtin) return
    const next = !siteScoped
    const nextIds = next ? siteIds : []
    setSiteScoped(next)
    if (!next) setSiteIds([])
    onUpdated({ ...role, site_scoped: next, site_ids: nextIds })
    scheduleSave(permissions, next, nextIds)
  }

  const toggleSiteId = (siteId: string) => {
    if (!canManage || role.is_builtin) return
    const next = siteIds.includes(siteId)
      ? siteIds.filter((id) => id !== siteId)
      : [...siteIds, siteId]
    setSiteIds(next)
    onUpdated({ ...role, site_ids: next })
    scheduleSave(permissions, siteScoped, next)
  }

  const handleSaveName = async () => {
    if (!nameValue.trim() || nameValue === role.name) {
      setEditingName(false)
      setNameValue(role.name)
      return
    }
    setSaving(true)
    try {
      await updateRole(role.id, {
        name: nameValue.trim(),
        permissions,
        site_scoped: siteScoped,
        site_ids: siteScoped ? siteIds : [],
      })
      onUpdated({ ...role, name: nameValue.trim() })
      setEditingName(false)
      toast.success('Role name updated')
    } catch (err) {
      toast.error(getAuthErrorMessage(err as Error) || 'Failed to update role name')
      setNameValue(role.name)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = () => {
    setConfirmDelete(true)
  }

  const doDelete = async () => {
    await deleteRole(role.id)
    onDeleted(role.id)
    toast.success(`"${role.name}" deleted`)
  }

  // Scope chip copy — built-in roles always span every site.
  const scopeLabel = siteScoped
    ? `${siteIds.length} ${siteIds.length === 1 ? 'site' : 'sites'}`
    : 'All sites'
  const permCount = isOwner ? 'All permissions' : `${permissions.length} permissions`

  return (
    <div>
      {/* Row header */}
      <div
        className="flex items-center gap-3 px-5 py-3.5 cursor-pointer select-none transition-colors duration-fast ease-apple hover:bg-muted"
        onClick={() => setExpanded((v) => !v)}
      >
        <RoleIcon slug={role.slug} />
        <ColorDot color={role.color} />

        {/* Name + meta */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {editingName && !role.is_builtin ? (
              <div
                className="flex items-center gap-1.5"
                onClick={(e) => e.stopPropagation()}
              >
                <Input
                  value={nameValue}
                  onChange={(e) => setNameValue(e.target.value)}
                  className="h-7 text-sm w-40"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveName()
                    if (e.key === 'Escape') {
                      setEditingName(false)
                      setNameValue(role.name)
                    }
                  }}
                />
                <button
                  onClick={handleSaveName}
                  disabled={saving}
                  aria-label="Save name"
                  className="p-1 rounded-none text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  <Check weight="bold" className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => {
                    setEditingName(false)
                    setNameValue(role.name)
                  }}
                  aria-label="Cancel rename"
                  className="p-1 rounded-none text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X weight="bold" className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <span className="text-sm font-medium text-foreground truncate">{nameValue}</span>
            )}

            {role.is_builtin && <StatusChip tone="neutral">Built-in</StatusChip>}
            <StatusChip tone="neutral">{scopeLabel}</StatusChip>
          </div>
          {role.is_builtin && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {role.slug === 'owner' && 'Full access to everything. Cannot be modified.'}
              {role.slug === 'admin' && 'Manage sites, team, and settings. Cannot access billing or delete the workspace.'}
              {role.slug === 'analyst' && 'Create and manage goals, funnels, and reports. Cannot manage sites, team, or billing.'}
              {role.slug === 'member' && 'Read-only access to dashboards, analytics, and team. Cannot create, edit, or delete anything.'}
              {role.slug === 'viewer' && 'View dashboards and analytics only. Cannot export data or change anything.'}
            </p>
          )}
        </div>

        {/* Permission count — mono metric */}
        <span className="hidden font-mono text-xs tabular-nums text-muted-foreground sm:inline shrink-0">
          {permCount}
        </span>

        {/* Actions — always visible (touch-safe), never hover-only */}
        <TooltipProvider>
          <div
            className="flex items-center gap-1 shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            {canManage && !role.is_builtin && !editingName && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setEditingName(true)}
                    aria-label="Rename role"
                    className="p-1.5 rounded-none text-muted-foreground hover:text-foreground hover:bg-muted transition-colors duration-fast ease-apple"
                  >
                    <Pencil weight="bold" className="w-3.5 h-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Rename</TooltipContent>
              </Tooltip>
            )}
            {canManage && !role.is_builtin && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleDelete}
                    aria-label="Delete role"
                    className="p-1.5 rounded-none text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors duration-fast ease-apple"
                  >
                    <Trash weight="bold" className="w-3.5 h-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Delete</TooltipContent>
              </Tooltip>
            )}
          </div>
        </TooltipProvider>

        <motion.div
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={SPRING}
          className="shrink-0 text-muted-foreground"
        >
          <CaretDown weight="bold" className="w-4 h-4" />
        </motion.div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete role"
        description={`Delete the "${role.name}" role? Members with this role will revert to Member.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={doDelete}
      />

      {/* Expanded permission panel */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: EASE_APPLE }}
            className="overflow-hidden"
          >
            <div className="border-t border-border bg-muted/30 px-5 py-5 space-y-5">
              {/* Owner note */}
              {isOwner && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Lock weight="bold" className="w-3.5 h-3.5 shrink-0" />
                  Owner always has all permissions and cannot be restricted.
                </div>
              )}

              {/* Auto-save indicator */}
              {savingIndicator ? (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Spinner className="w-3 h-3" />
                  Saving…
                </p>
              ) : savedIndicator ? (
                <StatusChip
                  tone="success"
                  icon={<Check weight="bold" className="w-3 h-3" />}
                >
                  Saved
                </StatusChip>
              ) : null}

              {/* Site-scoped controls */}
              {!isOwner && (
                <div className="space-y-3 border-b border-border pb-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">Site-scoped</p>
                      {role.is_builtin ? (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Built-in roles always have access to all sites.
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          When enabled, this role only has access to the selected sites.
                        </p>
                      )}
                    </div>
                    <Checkbox
                      checked={siteScoped}
                      disabled={!canManage || role.is_builtin}
                      onChange={toggleSiteScoped}
                    />
                  </div>
                  {siteScoped && !role.is_builtin && sites.length > 0 && (
                    <div className="space-y-2 pl-1">
                      <p className="font-mono text-micro-label uppercase text-muted-foreground">
                        Allowed sites
                      </p>
                      <ul className="space-y-2 max-h-40 overflow-y-auto pr-1">
                        {sites.map((site) => (
                          <li key={site.id}>
                            <Checkbox
                              id={`${role.id}-site-${site.id}`}
                              checked={siteIds.includes(site.id)}
                              disabled={!canManage}
                              onChange={() => toggleSiteId(site.id)}
                              label={site.name || site.domain}
                            />
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Permission matrix */}
              <PermissionMatrix
                groups={permissionGroups}
                idPrefix={role.id}
                isChecked={(perm) => (isOwner ? true : permissions.includes(perm))}
                isDisabled={(perm) =>
                  !canManage || isOwner || OWNER_ONLY_PERMS.has(perm)
                }
                showOwnerBadge={(perm) => OWNER_ONLY_PERMS.has(perm) && !isOwner}
                onToggle={togglePerm}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Ghost preview row (empty-state hint) ──────────────────────────────────────

function GhostRoleRow() {
  return (
    <div className="flex items-center gap-3 px-5 py-3.5">
      <Users weight="regular" className="w-4 h-4 text-muted-foreground shrink-0" />
      <span className="inline-block w-2 h-2 rounded-full bg-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <span className="text-sm font-medium text-foreground">Analyst</span>
        <StatusChip tone="neutral">All sites</StatusChip>
      </div>
      <span className="hidden font-mono text-xs tabular-nums text-muted-foreground sm:inline">
        6 permissions
      </span>
      <CaretDown weight="bold" className="w-4 h-4 text-muted-foreground shrink-0" />
    </div>
  )
}

// ─── Tab ──────────────────────────────────────────────────────────────────────

export default function WorkspaceRolesTab() {
  const { user } = useAuth()
  const canManage = useCan('roles.manage')

  const [roles, setRoles] = useState<Role[]>([])
  const [permissionGroups, setPermissionGroups] = useState<PermissionGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [showCreate, setShowCreate] = useState(false)

  const load = useCallback(async () => {
    setError(false)
    try {
      const [rolesData, groupsData] = await Promise.all([
        listRoles(),
        listPermissionGroups(),
      ])
      setRoles(rolesData.roles)
      setPermissionGroups(groupsData.groups)
    } catch {
      // Built-in roles always exist, so an empty result is impossible — a
      // failure here is a genuine error and must read as one, not as "no roles".
      setError(true)
    } finally {
      setLoading(false)
      setRetrying(false)
    }
  }, [])

  const handleRetry = useCallback(() => {
    setRetrying(true)
    load()
  }, [load])

  useEffect(() => {
    if (user?.org_id) load()
  }, [user?.org_id, load])

  const handleRoleUpdated = (updated: Role) => {
    setRoles((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))
  }

  const handleRoleDeleted = (roleId: string) => {
    setRoles((prev) => prev.filter((r) => r.id !== roleId))
  }

  const handleRoleCreated = (role: Role) => {
    setRoles((prev) => [...prev, role])
    setShowCreate(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner className="w-6 h-6 text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Primary CTA — the tab's one orange element (hidden while the create
          form is open, so its "Create role" submit is then the single accent). */}
      {canManage && !showCreate && !error && (
        <MastheadAction>
          <Button onClick={() => setShowCreate(true)} className="gap-1.5">
            <Plus weight="bold" className="w-3.5 h-3.5" />
            New role
          </Button>
        </MastheadAction>
      )}

      {/* Create form */}
      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: EASE_APPLE }}
          >
            <CreateRoleForm
              existingRoles={roles}
              permissionGroups={permissionGroups}
              onCreated={handleRoleCreated}
              onCancel={() => setShowCreate(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Roles */}
      {error ? (
        <SettingsErrorState
          message="We couldn't load roles and permissions. It may be a temporary problem."
          onRetry={handleRetry}
          retrying={retrying}
        />
      ) : roles.length === 0 ? (
        <SettingsPanel
          kicker="Roles"
          description="Roles control what each team member can access in your workspace."
        >
          <EmptyRow
            icon={<Users weight="regular" />}
            title="No roles configured"
            caption="Create a custom role to control what team members can access."
            action={
              canManage ? (
                <Button onClick={() => setShowCreate(true)} variant="secondary" className="gap-1.5">
                  <Plus weight="bold" className="w-3.5 h-3.5" />
                  New role
                </Button>
              ) : undefined
            }
            ghost={<GhostRoleRow />}
          />
        </SettingsPanel>
      ) : (
        <SettingsPanel
          kicker="Roles"
          // Only claim built-in roles can't be deleted when built-in rows are
          // actually rendered — the API can return custom roles only, and the copy
          // must not reference rows that aren't there.
          description={
            roles.some((r) => r.is_builtin)
              ? 'Built-in roles cannot be deleted. Expand a role to edit its permissions.'
              : 'Expand a role to edit its permissions.'
          }
        >
          <div className="divide-y divide-border">
            {roles.map((role) => (
              <RoleRow
                key={role.id}
                role={role}
                permissionGroups={permissionGroups}
                canManage={canManage}
                onUpdated={handleRoleUpdated}
                onDeleted={handleRoleDeleted}
              />
            ))}
          </div>
        </SettingsPanel>
      )}

      {/* Footer note for non-managers */}
      {!canManage && (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Lock weight="bold" className="w-3.5 h-3.5 shrink-0" />
          Only workspace owners can modify role permissions.
        </p>
      )}
    </div>
  )
}
