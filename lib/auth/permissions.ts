'use client'

import { useAuth } from '@/lib/auth/context'
import { getMyPermissions } from '@/lib/api/roles'
import useSWR from 'swr'

// Seven strings the server never checked (sites.view, analytics.view,
// quarantine.view, team.view, team.invite, team.manage, org.delete) were
// deleted estate-wide (batch 4). Surfaces they used to gate are either open
// to every member (matching what the server actually enforced all along) or
// gated on the member's ROLE SLUG below, mirroring ciphera-id's enforcement.
//
// 'reports.manage' left for a different reason (Phase 7): the server still
// enforces it, but the alert-channels surface it gated is gone, so nothing in
// this app asks the question any more.
export type Permission =
  | 'sites.create' | 'sites.edit' | 'sites.delete' | 'sites.reset_data'
  | 'analytics.export'
  | 'goals.manage' | 'funnels.manage'
  | 'integrations.manage'
  | 'uptime.manage' | 'pagespeed.manage'
  | 'quarantine.manage'
  | 'billing.view' | 'billing.manage'
  | 'roles.manage'
  | 'notification_settings.manage'
  | 'audit.view'

const DEFAULT_ADMIN_PERMS: Permission[] = [
  'sites.create', 'sites.edit', 'sites.delete',
  'analytics.export',
  'goals.manage', 'funnels.manage',
  'integrations.manage',
  'uptime.manage', 'pagespeed.manage',
  'quarantine.manage',
  'billing.view',
  'notification_settings.manage',
  'audit.view',
]

// Analyst/viewer fallbacks survive the seed trim: members assigned those
// roles before batch 4 keep them (the seed is insert-only), so the errored-
// fetch fallback must still know their shape.
const DEFAULT_ANALYST_PERMS: Permission[] = [
  'analytics.export',
  'goals.manage', 'funnels.manage',
]

const DEFAULT_MEMBER_PERMS: Permission[] = [
  'analytics.export',
  'billing.view',
]

// Viewer's two permissions were both in the deleted set; an errored-fetch
// viewer holds nothing gated, which matches what the server enforces.
const DEFAULT_VIEWER_PERMS: Permission[] = []

function getDefaultPermissions(role?: string): Set<Permission> {
  if (!role) return new Set()
  if (role === 'owner') return new Set([
    ...DEFAULT_ADMIN_PERMS,
    'sites.reset_data', 'billing.manage', 'roles.manage',
  ] as Permission[])
  if (role === 'admin') return new Set(DEFAULT_ADMIN_PERMS)
  if (role === 'analyst') return new Set(DEFAULT_ANALYST_PERMS)
  if (role === 'member') return new Set(DEFAULT_MEMBER_PERMS)
  if (role === 'viewer') return new Set(DEFAULT_VIEWER_PERMS)
  return new Set()
}

export function usePermissions(): Set<Permission> {
  const { user } = useAuth()
  const { data, error } = useSWR(
    user ? 'permissions' : null,
    () => getMyPermissions(),
    { revalidateOnFocus: false, dedupingInterval: 300_000 }
  )
  if (data?.permissions) return new Set(data.permissions as Permission[])
  // No data yet — errored OR still in flight. Both fall back to the JWT role's
  // defaults rather than an empty Set: an empty Set reads as "may do nothing",
  // which flashed "Only the workspace owner can modify billing" at the actual
  // owner on every billing-page load. The role slug is available synchronously
  // from the JWT, and since the RBAC trim (migrations 156/157) the server's
  // answer IS the role default, so the fallback cannot over- or under-offer.
  return getDefaultPermissions(user?.role)
}

export function useCan(perm: Permission): boolean {
  const perms = usePermissions()
  return perms.has(perm)
}

// Role-slug gates, for the surfaces whose real enforcement is ciphera-id's
// role check (team mutation: owner-or-admin; workspace deletion: owner). The
// slug comes from the JWT ciphera-id minted — the server still enforces on
// its side; these only decide what the UI offers.
// 🔴 Who the onboarding wall may legitimately hold (05-09-2026).
//
// `onboarding_completed_at` is an ORG-level flag, but ciphera-id lets ONLY the
// owner write it — CompleteOnboardingHandler hard-403s any other role. So
// walling a non-owner aimed them at a wizard whose last step they are refused:
// walked through the site, install and BILLING steps, 403'd, and bounced back
// with the error swallowed. No exit but /settings/*.
//
// ⚠️ An UNKNOWN role is still walled, deliberately. We relax only on positive
// evidence that the viewer cannot clear the flag — never merely because we
// failed to find out what they are. Getting that backwards would let a real
// owner past the wall whenever their role had not loaded yet.
//
// Pure and exported so it is testable without standing up AuthProvider; the
// wall in lib/auth/context.tsx is its only caller.
export function isSubjectToOnboardingWall(role: string | undefined | null): boolean {
  if (!role) return true // unknown → behave exactly as before
  return role === 'owner'
}

export function useIsOwner(): boolean {
  const { user } = useAuth()
  return user?.role === 'owner'
}

export function useIsAdminOrOwner(): boolean {
  const { user } = useAuth()
  return user?.role === 'owner' || user?.role === 'admin'
}
