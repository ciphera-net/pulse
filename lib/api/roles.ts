import apiRequest from '@/lib/api/client'

export interface Role {
  id: string
  organization_id: string
  name: string
  slug: string
  is_builtin: boolean
  color: string | null
  permissions: string[]
  site_scoped: boolean
  site_ids?: string[]
  created_at: string
  updated_at: string
}

export interface PermissionInfo {
  permission: string
  label: string
  description: string
}

export interface PermissionGroup {
  key: string
  label: string
  permissions: PermissionInfo[]
}

// The builtin slugs an invite link can grant. The finer roles (analyst,
// viewer, pre-trim customs) were only ever assigned through the removed
// metadata.role_id path, so they are viewable but not assignable — the
// invite modal offers exactly this set and the roles tab labels everything
// outside it. One const so the two surfaces cannot drift.
export const INVITABLE_SLUGS = ['admin', 'member']

// Reads only — custom-role CRUD was removed with the backend routes
// (pre-launch triage batch 4).
export const listRoles = () =>
  apiRequest<{ roles: Role[] }>('/roles')

export const listPermissionGroups = () =>
  apiRequest<{ groups: PermissionGroup[] }>('/roles/permissions')

export const getMyPermissions = () =>
  apiRequest<{ permissions: string[]; site_scoped: boolean; site_ids?: string[] }>('/roles/my-permissions')
