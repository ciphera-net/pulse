'use client'

import { useAuth } from '@/lib/auth/context'
import { getMyPermissions } from '@/lib/api/roles'
import useSWR from 'swr'

export type Permission =
  | 'sites.view' | 'sites.create' | 'sites.edit' | 'sites.delete' | 'sites.reset_data'
  | 'analytics.view' | 'analytics.export'
  | 'goals.manage' | 'funnels.manage' | 'reports.manage'
  | 'integrations.manage'
  | 'uptime.manage' | 'pagespeed.manage' | 'privacy_scan.manage'
  | 'quarantine.view' | 'quarantine.manage'
  | 'billing.view' | 'billing.manage'
  | 'team.view' | 'team.invite' | 'team.manage'
  | 'roles.manage'
  | 'notification_settings.manage' | 'webhooks.manage'
  | 'audit.view'
  | 'org.delete'

const DEFAULT_ADMIN_PERMS: Permission[] = [
  'sites.view', 'sites.create', 'sites.edit', 'sites.delete',
  'analytics.view', 'analytics.export',
  'goals.manage', 'funnels.manage', 'reports.manage',
  'integrations.manage',
  'uptime.manage', 'pagespeed.manage', 'privacy_scan.manage',
  'quarantine.view', 'quarantine.manage',
  'billing.view',
  'team.view', 'team.invite', 'team.manage',
  'notification_settings.manage', 'webhooks.manage',
  'audit.view',
]

const DEFAULT_MEMBER_PERMS: Permission[] = [
  'sites.view',
  'analytics.view', 'analytics.export',
  'quarantine.view',
  'billing.view',
  'team.view',
]

function getDefaultPermissions(role?: string): Set<Permission> {
  if (!role) return new Set()
  if (role === 'owner') return new Set([
    ...DEFAULT_ADMIN_PERMS,
    'sites.reset_data', 'billing.manage', 'roles.manage', 'org.delete',
  ] as Permission[])
  if (role === 'admin') return new Set(DEFAULT_ADMIN_PERMS)
  if (role === 'member') return new Set(DEFAULT_MEMBER_PERMS)
  return new Set()
}

export function usePermissions(): Set<Permission> {
  const { user } = useAuth()
  const { data } = useSWR(
    user ? 'permissions' : null,
    () => getMyPermissions(),
    { revalidateOnFocus: false, dedupingInterval: 300_000 }
  )
  const permissions = data?.permissions ?? []
  if (permissions.length > 0) return new Set(permissions as Permission[])
  return getDefaultPermissions(user?.role)
}

export function useSiteAccess(): { siteScoped: boolean; siteIds: string[] | null } {
  const { user } = useAuth()
  const { data } = useSWR(
    user ? 'permissions' : null,
    () => getMyPermissions(),
    { revalidateOnFocus: false, dedupingInterval: 300_000 }
  )
  if (data?.site_scoped) return { siteScoped: true, siteIds: data.site_ids ?? [] }
  return { siteScoped: false, siteIds: null }
}

export function useCan(perm: Permission): boolean {
  const perms = usePermissions()
  return perms.has(perm)
}

export function useCanAny(...perms: Permission[]): boolean {
  const resolved = usePermissions()
  return perms.some(p => resolved.has(p))
}
