'use client'

import { useState, useEffect, useCallback, useId } from 'react'
import { cn } from '@/lib/utils'
import { RailGrid, RailGridTile } from '@ciphera-net/facet'
import {
  CaretDown,
  Check,
  Minus,
  Crown,
  ShieldCheck,
  UserCircle,
  Lock,
  Users,
} from '@phosphor-icons/react'
import { SettingsPanel, PanelRows, EmptyRow } from '@/components/settings/panels'
import { StatusChip } from '@/components/settings/StatusChip'
import { SettingsErrorState } from '@/components/settings/SettingsErrorState'
import SettingsLoadingState from '@/components/settings/SettingsLoadingState'
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

// ─── Permission mark (granted / not granted glyph, display only) ──────────────

function PermissionMark({ granted }: { granted: boolean }) {
  return (
    <span
      role="img"
      aria-label={granted ? 'Granted' : 'Not granted'}
      className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground"
    >
      {granted ? (
        <Check weight="bold" className="h-3.5 w-3.5" />
      ) : (
        <Minus weight="bold" className="h-3.5 w-3.5" />
      )}
    </span>
  )
}

// ─── Permission matrix (read-only, grouped in RailGrid bands) ─────────────────

interface PermissionMatrixProps {
  groups: PermissionGroup[]
  isChecked: (perm: string) => boolean
  /** Whether to surface the "Owner only" chip on the owner-locked permissions. */
  showOwnerBadge: (perm: string) => boolean
}

function PermissionMatrix({ groups, isChecked, showOwnerBadge }: PermissionMatrixProps) {
  return (
    <RailGrid minTileWidth={260}>
      {groups.map((group) => (
        <RailGridTile key={group.key} className="space-y-3">
          <p className="text-sm font-semibold text-foreground">{group.label}</p>
          <div className="space-y-3">
            {group.permissions.map((pi) => {
              const checked = isChecked(pi.permission)
              return (
                <div key={pi.permission} className="flex items-start gap-3">
                  <PermissionMark granted={checked} />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="inline-flex flex-wrap items-center gap-2">
                      <span className={cn('text-sm', checked ? 'text-foreground' : 'text-muted-foreground')}>
                        {pi.label}
                      </span>
                      {showOwnerBadge(pi.permission) && (
                        <StatusChip tone="neutral">Owner only</StatusChip>
                      )}
                    </span>
                    <span className="text-xs text-muted-foreground">{pi.description}</span>
                  </span>
                </div>
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
  const contentId = useId()

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
      {/* Row header — the ONE control that expands this row. */}
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={contentId}
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors duration-fast ease-apple hover:bg-muted motion-reduce:transition-none"
      >
        <RoleIcon slug={role.slug} />
        <ColorDot color={role.color} />

        {/* Name + meta */}
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium text-foreground">{role.name}</span>
            {/* Roles outside the invitable set are held only by members from
                before the trim — nothing can assign them any more. */}
            {role.slug !== 'owner' && !INVITABLE_SLUGS.includes(role.slug) && (
              <StatusChip tone="warning" dot>Not assignable</StatusChip>
            )}
            <StatusChip tone="neutral">{scopeLabel}</StatusChip>
          </span>
          {role.is_builtin && (
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {role.slug === 'owner' && 'Full access to everything.'}
              {role.slug === 'admin' && 'Manage sites, team, and settings. Cannot access billing or delete the team.'}
              {role.slug === 'analyst' && 'Create and manage goals, funnels, and alert channels. Cannot manage sites, team, or billing.'}
              {role.slug === 'member' && 'Day-to-day access to dashboards and analytics.'}
              {role.slug === 'viewer' && 'View dashboards and analytics only.'}
            </span>
          )}
        </span>

        {/* Permission count — tabular metric */}
        <span className="hidden shrink-0 tabular-nums text-xs text-muted-foreground sm:inline">
          {permCount}
        </span>

        <CaretDown
          weight="bold"
          className={cn(
            'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-base ease-apple motion-reduce:transition-none',
            expanded && 'rotate-180',
          )}
        />
      </button>

      {/* Expanded permission panel — CSS grid-rows for height, opacity for
          fade, both on the house curve (duration-base / ease-apple). */}
      <div
        id={contentId}
        className="grid transition-[grid-template-rows] duration-base ease-apple motion-reduce:transition-none"
        style={{ gridTemplateRows: expanded ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          <div
            className={cn(
              'space-y-5 border-t border-border px-5 py-5 transition-opacity duration-base ease-apple motion-reduce:transition-none',
              expanded ? 'opacity-100' : 'opacity-0',
            )}
          >
            {/* Owner note */}
            {isOwner && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Lock weight="bold" className="w-3.5 h-3.5 shrink-0" />
                Owner always has all permissions.
              </div>
            )}

            {/* Site scope, for pre-trim site-scoped roles that still exist */}
            {siteScoped && (
              <p className="border-b border-border pb-4 text-xs text-muted-foreground">
                This role is limited to {scopeLabel.toLowerCase()}.
              </p>
            )}

            {/* Permission matrix */}
            <PermissionMatrix
              groups={permissionGroups}
              isChecked={(perm) => (isOwner ? true : role.permissions.includes(perm))}
              showOwnerBadge={(perm) => OWNER_ONLY_PERMS.has(perm) && !isOwner}
            />
          </div>
        </div>
      </div>
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

  if (loading) return <SettingsLoadingState rows={4} />

  if (error) {
    return (
      <SettingsErrorState
        title="Couldn't load roles and permissions"
        message="Try again in a moment."
        onRetry={handleRetry}
        retrying={retrying}
      />
    )
  }

  return (
    <div className="space-y-8">
      <SettingsPanel
        title="Roles and permissions"
        description="What each role can do. New members get Admin or Member through their invite link. Roles marked not assignable are held only by members who had them before."
      >
        {roles.length === 0 ? (
          <EmptyRow
            icon={<Users weight="regular" />}
            title="No roles configured"
            caption="Built-in roles should always exist. If this persists, contact support."
          />
        ) : (
          <PanelRows>
            {roles.map((role) => (
              <RoleRow key={role.id} role={role} permissionGroups={permissionGroups} />
            ))}
          </PanelRows>
        )}
      </SettingsPanel>
    </div>
  )
}
