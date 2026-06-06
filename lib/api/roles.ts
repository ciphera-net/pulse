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

export const listRoles = () =>
  apiRequest<{ roles: Role[] }>('/roles')

export const getRole = (roleId: string) =>
  apiRequest<Role>(`/roles/${roleId}`)

export const createRole = (data: {
  name: string
  slug: string
  color?: string
  permissions: string[]
  site_scoped?: boolean
  site_ids?: string[]
}) =>
  apiRequest<Role>('/roles', {
    method: 'POST',
    body: JSON.stringify(data),
  })

export const updateRole = (
  roleId: string,
  data: { name: string; color?: string; permissions: string[]; site_scoped?: boolean; site_ids?: string[] }
) =>
  apiRequest<void>(`/roles/${roleId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })

export const deleteRole = (roleId: string) =>
  apiRequest<void>(`/roles/${roleId}`, { method: 'DELETE' })

export const listPermissionGroups = () =>
  apiRequest<{ groups: PermissionGroup[] }>('/roles/permissions')

export const getMyPermissions = () =>
  apiRequest<{ permissions: string[]; site_scoped: boolean; site_ids?: string[] }>('/roles/my-permissions')
