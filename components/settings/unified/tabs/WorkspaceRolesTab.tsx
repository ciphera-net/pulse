'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { EASE_APPLE, SPRING } from '@/lib/motion'
import { cn } from '@/lib/utils'
import { Checkbox, RailGrid, RailGridTile, Spinner } from '@ciphera-net/facet'
import {
  CaretDown,
  Crown,
  ShieldCheck,
  UserCircle,
  Lock,
  Users,
} from '@phosphor-icons/react'
import { SettingsPanel } from '@/components/settings/panels'
import { StatusChip } from '@/components/settings/StatusChip'
import { SettingsErrorState } from '@/components/settings/SettingsErrorState'
import { useAuth } from '@/lib/auth/context'
import {
  listRoles,
  listPermissionGroups,
  INVITABLE_SLUGS,
  type Role,
  type PermissionGroup,
} from '@/lib/api/roles'

// Read-only. Custom-role CRUD was removed (pre-launch triage batch 4): the
// product's roles are the built-ins, assignment happens through invite links,
// and this tab documents what each role can do. Roles created before the trim
// still render — read-only like everything else.

// Permissions that only Owner can ever hold
const OWNER_ONLY_PERMS = new Set(['roles.manage'])

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

// ─── Permission matrix (read-only Checkbox grid grouped in RailGrid bands) ─────

interface PermissionMatrixProps {
  groups: PermissionGroup[]
  idPrefix: string
  isChecked: (perm: string) => boolean
  /** Whether to surface the "Owner only" chip on the owner-locked permissions. */
  showOwnerBadge: (perm: string) => boolean
}

function PermissionMatrix({
  groups,
  idPrefix,
  isChecked,
  showOwnerBadge,
}: PermissionMatrixProps) {
  return (
    <RailGrid minTileWidth={260}>
      {groups.map((group) => (
        <RailGridTile key={group.key} className="space-y-3">
          <p className="font-semibold text-micro-label uppercase text-muted-foreground">
            {group.label}
          </p>
          <div className="space-y-3">
            {group.permissions.map((pi) => {
              const checked = isChecked(pi.permission)
              return (
                <Checkbox
                  key={pi.permission}
                  id={`${idPrefix}-${pi.permission}`}
                  checked={checked}
                  disabled
                  onChange={() => {}}
                  label={
                    <span className="flex flex-col gap-0.5">
                      <span className="inline-flex items-center gap-2">
                        <span className={cn('text-sm', checked ? 'text-foreground' : 'text-muted-foreground')}>
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

// ─── Role row (display only) ──────────────────────────────────────────────────

interface RoleRowProps {
  role: Role
  permissionGroups: PermissionGroup[]
}

function RoleRow({ role, permissionGroups }: RoleRowProps) {
  const [expanded, setExpanded] = useState(false)

  const isOwner = role.slug === 'owner'
  const siteScoped = role.site_scoped ?? false
  const siteIds = role.site_ids ?? []

  // Scope chip copy — built-in roles always span every site.
  const scopeLabel = siteScoped
    ? `${siteIds.length} ${siteIds.length === 1 ? 'site' : 'sites'}`
    : 'All sites'
  const permCount = isOwner ? 'All permissions' : `${role.permissions.length} permissions`

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
            <span className="text-sm font-medium text-foreground truncate">{role.name}</span>
            {role.is_builtin && <StatusChip tone="neutral">Built-in</StatusChip>}
            {/* Roles outside the invitable set are held only by members from
                before the trim — nothing can assign them any more. */}
            {role.slug !== 'owner' && !INVITABLE_SLUGS.includes(role.slug) && (
              <StatusChip tone="neutral">Not assignable</StatusChip>
            )}
            <StatusChip tone="neutral">{scopeLabel}</StatusChip>
          </div>
          {role.is_builtin && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {role.slug === 'owner' && 'Full access to everything.'}
              {role.slug === 'admin' && 'Manage sites, team, and settings. Cannot access billing or delete the workspace.'}
              {role.slug === 'analyst' && 'Create and manage goals, funnels, and alert channels. Cannot manage sites, team, or billing.'}
              {role.slug === 'member' && 'Day-to-day access to dashboards and analytics.'}
              {role.slug === 'viewer' && 'View dashboards and analytics only.'}
            </p>
          )}
        </div>

        {/* Permission count — tabular metric */}
        <span className="hidden tabular-nums text-xs text-muted-foreground sm:inline shrink-0">
          {permCount}
        </span>

        <motion.div
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={SPRING}
          className="shrink-0 text-muted-foreground"
        >
          <CaretDown weight="bold" className="w-4 h-4" />
        </motion.div>
      </div>

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
                  Owner always has all permissions.
                </div>
              )}

              {/* Site scope, for pre-trim site-scoped roles that still exist */}
              {siteScoped && (
                <p className="text-xs text-muted-foreground border-b border-border pb-4">
                  This role is limited to {scopeLabel.toLowerCase()}.
                </p>
              )}

              {/* Permission matrix */}
              <PermissionMatrix
                groups={permissionGroups}
                idPrefix={role.id}
                isChecked={(perm) => (isOwner ? true : role.permissions.includes(perm))}
                showOwnerBadge={(perm) => OWNER_ONLY_PERMS.has(perm) && !isOwner}
              />
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

  const [roles, setRoles] = useState<Role[]>([])
  const [permissionGroups, setPermissionGroups] = useState<PermissionGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [retrying, setRetrying] = useState(false)

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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner className="w-6 h-6 text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {error ? (
        <SettingsErrorState
          message="We couldn't load roles and permissions. It may be a temporary problem."
          onRetry={handleRetry}
          retrying={retrying}
        />
      ) : (
        <SettingsPanel
          kicker="Roles"
          description="What each role can do. New members get Admin or Member through their invite link; roles marked not assignable are held only by members who had them before."
        >
          <div className="divide-y divide-border">
            {roles.map((role) => (
              <RoleRow key={role.id} role={role} permissionGroups={permissionGroups} />
            ))}
          </div>
        </SettingsPanel>
      )}
    </div>
  )
}
