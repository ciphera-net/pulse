'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button, Input, Spinner, toast, getAuthErrorMessage } from '@ciphera-net/ui'
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
import { EmptyState } from '@/components/ui/EmptyState'
import { useAuth } from '@/lib/auth/context'
import { useCan } from '@/lib/auth/permissions'
import { SPRING } from '@/lib/motion'
import {
  listRoles,
  listPermissionGroups,
  createRole,
  updateRole,
  deleteRole,
  type Role,
  type PermissionGroup,
} from '@/lib/api/roles'

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
  const bg = color ?? '#6b7280'
  return (
    <span
      className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
      style={{ background: bg }}
    />
  )
}

// ─── Built-in role icon ───────────────────────────────────────────────────────

function RoleIcon({ slug }: { slug: string }) {
  if (slug === 'owner')
    return <Crown weight="fill" className="w-4 h-4 text-brand-orange" />
  if (slug === 'admin')
    return <ShieldCheck weight="fill" className="w-4 h-4 text-blue-400" />
  if (slug === 'member')
    return <UserCircle weight="fill" className="w-4 h-4 text-neutral-400" />
  return <Users weight="regular" className="w-4 h-4 text-neutral-400" />
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
    <div className="rounded-xl border border-neutral-800 bg-neutral-800/30 p-5 space-y-5">
      <h4 className="text-sm font-semibold text-white">New custom role</h4>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-xs text-neutral-500">Name</label>
          <Input
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="e.g. Analyst"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-neutral-500">Slug</label>
          <Input
            value={slug}
            onChange={(e) => handleSlugChange(e.target.value)}
            placeholder="e.g. analyst"
          />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs text-neutral-500">Copy permissions from</label>
        <div className="flex gap-2 flex-wrap">
          {templateOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setTemplateSlug(opt.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ease-apple ${
                templateSlug === opt.value
                  ? 'border-brand-orange/60 bg-brand-orange/10 text-brand-orange'
                  : 'border-neutral-700 text-neutral-400 hover:text-white hover:border-neutral-600'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Permission checkboxes for the new role */}
      <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
        {permissionGroups.map((group) => (
          <div key={group.key}>
            <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">
              {group.label}
            </p>
            <ul className="space-y-1">
              {group.permissions.map((pi) => {
                const ownerOnly = OWNER_ONLY_PERMS.has(pi.permission)
                const checked = ownerOnly ? false : permissions.includes(pi.permission)
                return (
                  <li
                    key={pi.permission}
                    className={`flex items-start gap-3 py-1 ${ownerOnly ? 'opacity-40' : ''}`}
                  >
                    <input
                      id={`new-${pi.permission}`}
                      type="checkbox"
                      checked={checked}
                      disabled={ownerOnly}
                      onChange={() => togglePerm(pi.permission)}
                      className="mt-0.5 w-4 h-4 rounded border-neutral-600 bg-neutral-800 accent-brand-orange cursor-pointer disabled:cursor-not-allowed"
                    />
                    <label
                      htmlFor={`new-${pi.permission}`}
                      className={`flex-1 min-w-0 ${ownerOnly ? '' : 'cursor-pointer'}`}
                    >
                      <span className="text-sm text-white">{pi.label}</span>
                      {ownerOnly && (
                        <span className="ml-2 text-[10px] font-semibold uppercase tracking-wider text-brand-orange border border-brand-orange/30 rounded px-1.5 py-0.5">
                          Owner only
                        </span>
                      )}
                      <p className="text-xs text-neutral-500 mt-0.5">{pi.description}</p>
                    </label>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>

      <div className="flex gap-2 justify-end pt-2 border-t border-neutral-800">
        <Button onClick={onCancel} variant="secondary" className="text-sm">
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          variant="primary"
          className="text-sm gap-1.5"
          disabled={saving || !name.trim() || !slug.trim()}
        >
          <Check weight="bold" className="w-3.5 h-3.5" />
          {saving ? 'Creating…' : 'Create role'}
        </Button>
      </div>
    </div>
  )
}

// ─── Role card ────────────────────────────────────────────────────────────────

interface RoleCardProps {
  role: Role
  permissionGroups: PermissionGroup[]
  canManage: boolean
  onUpdated: (role: Role) => void
  onDeleted: (roleId: string) => void
}

function RoleCard({
  role,
  permissionGroups,
  canManage,
  onUpdated,
  onDeleted,
}: RoleCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState(role.name)
  const [permissions, setPermissions] = useState<string[]>(role.permissions)
  const [saving, setSaving] = useState(false)
  const [savingIndicator, setSavingIndicator] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isOwner = role.slug === 'owner'

  // Auto-save permissions with debounce
  const scheduleSave = useCallback(
    (nextPerms: string[]) => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(async () => {
        setSavingIndicator(true)
        try {
          await updateRole(role.id, { name: role.name, permissions: nextPerms })
        } catch (err) {
          toast.error(getAuthErrorMessage(err as Error) || 'Failed to save permissions')
          // Revert
          setPermissions(role.permissions)
        } finally {
          setSavingIndicator(false)
        }
      }, 400)
    },
    [role.id, role.name, role.permissions]
  )

  const togglePerm = (perm: string) => {
    if (!canManage || isOwner || OWNER_ONLY_PERMS.has(perm)) return
    const next = permissions.includes(perm)
      ? permissions.filter((p) => p !== perm)
      : [...permissions, perm]
    setPermissions(next)
    onUpdated({ ...role, permissions: next })
    scheduleSave(next)
  }

  const handleSaveName = async () => {
    if (!nameValue.trim() || nameValue === role.name) {
      setEditingName(false)
      setNameValue(role.name)
      return
    }
    setSaving(true)
    try {
      await updateRole(role.id, { name: nameValue.trim(), permissions })
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

  const handleDelete = async () => {
    if (!confirm(`Delete the "${role.name}" role? Members with this role will revert to Member.`)) return
    try {
      await deleteRole(role.id)
      onDeleted(role.id)
      toast.success(`"${role.name}" deleted`)
    } catch (err) {
      toast.error(getAuthErrorMessage(err as Error) || 'Failed to delete role')
    }
  }

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-800/20 overflow-hidden">
      {/* Card header */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none hover:bg-neutral-800/40 transition-colors ease-apple"
        onClick={() => setExpanded((v) => !v)}
      >
        <RoleIcon slug={role.slug} />
        <ColorDot color={role.color} />

        {/* Name */}
        <div className="flex-1 min-w-0 flex items-center gap-2">
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
                className="p-1 rounded text-green-400 hover:bg-green-900/20 transition-colors"
              >
                <Check weight="bold" className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => {
                  setEditingName(false)
                  setNameValue(role.name)
                }}
                className="p-1 rounded text-neutral-500 hover:text-neutral-300 transition-colors"
              >
                <X weight="bold" className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <span className="text-sm font-medium text-white truncate">{nameValue}</span>
          )}

          {role.is_builtin && (
            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-neutral-500 border border-neutral-700 rounded px-1.5 py-0.5">
              Built-in
            </span>
          )}
        </div>

        {/* Actions */}
        <div
          className="flex items-center gap-1.5 shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          {canManage && !role.is_builtin && !editingName && (
            <button
              onClick={() => setEditingName(true)}
              className="p-1.5 rounded-lg text-neutral-500 hover:text-neutral-200 hover:bg-white/[0.06] transition-colors ease-apple"
              title="Rename role"
            >
              <Pencil weight="bold" className="w-3.5 h-3.5" />
            </button>
          )}
          {canManage && !role.is_builtin && (
            <button
              onClick={handleDelete}
              className="p-1.5 rounded-lg text-neutral-500 hover:text-red-400 hover:bg-red-900/20 transition-colors ease-apple"
              title="Delete role"
            >
              <Trash weight="bold" className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <motion.div
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={SPRING}
          className="shrink-0 text-neutral-500"
        >
          <CaretDown weight="bold" className="w-4 h-4" />
        </motion.div>
      </div>

      {/* Expanded permissions panel */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
            className="overflow-hidden"
          >
            <div className="border-t border-neutral-800 px-4 py-4 space-y-5">
              {/* Owner note */}
              {isOwner && (
                <div className="flex items-center gap-2 text-xs text-neutral-500">
                  <Lock weight="bold" className="w-3.5 h-3.5 shrink-0" />
                  Owner always has all permissions and cannot be restricted.
                </div>
              )}

              {/* Auto-save indicator */}
              {savingIndicator && (
                <p className="text-xs text-neutral-500">Saving…</p>
              )}

              {permissionGroups.map((group) => (
                <div key={group.key}>
                  <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">
                    {group.label}
                  </p>
                  <ul className="space-y-2">
                    {group.permissions.map((pi) => {
                      const ownerOnly = OWNER_ONLY_PERMS.has(pi.permission)
                      const locked = isOwner || ownerOnly
                      const checked = isOwner ? true : permissions.includes(pi.permission)
                      const editable = canManage && !locked

                      return (
                        <li key={pi.permission} className="flex items-start gap-3">
                          <input
                            id={`${role.id}-${pi.permission}`}
                            type="checkbox"
                            checked={checked}
                            disabled={!editable}
                            onChange={() => togglePerm(pi.permission)}
                            className="mt-0.5 w-4 h-4 rounded border-neutral-600 bg-neutral-800 accent-brand-orange cursor-pointer disabled:cursor-not-allowed"
                          />
                          <label
                            htmlFor={`${role.id}-${pi.permission}`}
                            className={`flex-1 min-w-0 ${editable ? 'cursor-pointer' : ''}`}
                          >
                            <span className={`text-sm ${locked && !isOwner ? 'text-neutral-500' : 'text-white'}`}>
                              {pi.label}
                            </span>
                            {ownerOnly && !isOwner && (
                              <span className="ml-2 text-[10px] font-semibold uppercase tracking-wider text-brand-orange border border-brand-orange/30 rounded px-1.5 py-0.5">
                                Owner only
                              </span>
                            )}
                            <p className="text-xs text-neutral-500 mt-0.5">{pi.description}</p>
                          </label>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
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
  const [showCreate, setShowCreate] = useState(false)

  const load = useCallback(async () => {
    try {
      const [rolesData, groupsData] = await Promise.all([
        listRoles(),
        listPermissionGroups(),
      ])
      setRoles(rolesData.roles)
      setPermissionGroups(groupsData.groups)
    } catch {
      // Silently handle — the empty state surfaces naturally
    } finally {
      setLoading(false)
    }
  }, [])

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
        <Spinner className="w-6 h-6 text-neutral-500" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-white mb-1">Roles &amp; Permissions</h3>
          <p className="text-sm text-neutral-400">
            Control what each role can do in your workspace. Built-in roles cannot be deleted.
          </p>
        </div>
        {canManage && !showCreate && (
          <Button
            onClick={() => setShowCreate(true)}
            variant="primary"
            className="text-sm gap-1.5 shrink-0"
          >
            <Plus weight="bold" className="w-3.5 h-3.5" />
            New role
          </Button>
        )}
      </div>

      {/* Create form */}
      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
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

      {/* Role cards */}
      {roles.length === 0 ? (
        <EmptyState
          title="No roles configured"
          description="Roles let you control what each team member can access in the workspace."
          icon={<Users weight="regular" />}
          className="py-8"
        />
      ) : (
        <div className="space-y-3">
          {roles.map((role) => (
            <RoleCard
              key={role.id}
              role={role}
              permissionGroups={permissionGroups}
              canManage={canManage}
              onUpdated={handleRoleUpdated}
              onDeleted={handleRoleDeleted}
            />
          ))}
        </div>
      )}

      {/* Footer note for non-managers */}
      {!canManage && (
        <p className="text-xs text-neutral-500 flex items-center gap-1.5">
          <Lock weight="bold" className="w-3.5 h-3.5 shrink-0" />
          Only workspace owners can modify role permissions.
        </p>
      )}
    </div>
  )
}
