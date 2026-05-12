import { authFetch } from './client'

export interface Organization {
  id: string
  name: string
  slug: string
  plan_tier: string
  created_at: string
  onboarding_completed_at: string | null
}

export interface OrganizationMember {
  organization_id: string
  user_id: string
  role: 'owner' | 'admin' | 'member'
  joined_at: string
  organization_name?: string
  organization_slug?: string
  user_email?: string
}

export interface InviteLink {
  id: string
  organization_id: string
  name: string
  role: string
  metadata?: { app?: string; role_id?: string; site_ids?: string[] }
  max_uses: number | null
  use_count: number
  expires_at: string
  created_by: string
  created_at: string
  code?: string
  url?: string
}

export interface InviteLinkInfo {
  organization_name: string
  organization_id: string
  role: string
  name: string
  metadata?: { app?: string; role_id?: string; site_ids?: string[] }
}

// Create a new organization
export async function createOrganization(name: string, slug: string): Promise<Organization> {
  // Use authFetch (Authenticated via Ciphera ID)
  // * Note: authFetch returns the parsed JSON body, not the Response object
  return await authFetch<Organization>('/auth/organizations', {
    method: 'POST',
    body: JSON.stringify({ name, slug }),
  })
}

// List organizations user belongs to
export async function getUserOrganizations(): Promise<OrganizationMember[]> {
  const data = await authFetch<{ organizations: OrganizationMember[] }>('/auth/organizations')
  return data.organizations || []
}

// Switch Context (Get token for specific org)
export async function switchContext(organizationId: string | null): Promise<{ access_token: string; expires_in: number }> {
  const payload = { organization_id: organizationId || '' }
  return await authFetch<{ access_token: string; expires_in: number }>('/auth/switch-context', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

// Get organization details
export async function getOrganization(organizationId: string): Promise<Organization> {
  return await authFetch<Organization>(`/auth/organizations/${organizationId}`)
}

// Delete an organization
export async function deleteOrganization(organizationId: string): Promise<void> {
  await authFetch(`/auth/organizations/${organizationId}`, {
    method: 'DELETE',
  })
}

export async function completeOnboarding(organizationId: string): Promise<void> {
  await authFetch(`/auth/organizations/${organizationId}/complete-onboarding`, {
    method: 'POST',
  })
}

// Update organization details
export async function updateOrganization(organizationId: string, name: string, slug: string): Promise<Organization> {
  return await authFetch<Organization>(`/auth/organizations/${organizationId}`, {
    method: 'PUT',
    body: JSON.stringify({ name, slug }),
  })
}

// Get organization members
export async function getOrganizationMembers(organizationId: string): Promise<OrganizationMember[]> {
  const data = await authFetch<{ members: OrganizationMember[] }>(`/auth/organizations/${organizationId}/members`)
  return data.members || []
}

// Remove a member from the organization
export async function removeOrganizationMember(organizationId: string, userId: string): Promise<void> {
  await authFetch(`/auth/organizations/${organizationId}/members/${userId}`, {
    method: 'DELETE',
  })
}

// Transfer ownership of an organization to another member.
// After a successful transfer the caller becomes a regular member.
export async function transferOwnership(organizationId: string, targetUserId: string): Promise<void> {
  await authFetch(`/auth/organizations/${organizationId}/transfer-ownership`, {
    method: 'POST',
    body: JSON.stringify({ target_user_id: targetUserId }),
  })
}

export async function createInviteLink(
  orgId: string,
  params: { name: string; role: string; metadata?: object; max_uses?: number; expires_in: string }
): Promise<InviteLink> {
  return await authFetch<InviteLink>(`/auth/organizations/${orgId}/invite-links`, {
    method: 'POST',
    body: JSON.stringify(params),
  })
}

export async function getInviteLinks(orgId: string): Promise<InviteLink[]> {
  const data = await authFetch<{ invite_links: InviteLink[] }>(`/auth/organizations/${orgId}/invite-links`)
  return data.invite_links ?? []
}

export async function revokeInviteLink(orgId: string, linkId: string): Promise<void> {
  await authFetch(`/auth/organizations/${orgId}/invite-links/${linkId}`, { method: 'DELETE' })
}

export async function acceptInviteLink(code: string): Promise<{ organization_id: string; metadata?: object }> {
  return await authFetch<{ organization_id: string; metadata?: object }>(`/auth/invite-links/${code}/accept`, {
    method: 'POST',
  })
}
