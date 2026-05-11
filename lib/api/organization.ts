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

export interface OrganizationInvitation {
  id: string
  organization_id: string
  email: string
  role: 'owner' | 'admin' | 'member'
  invited_by: string
  expires_at: string
  created_at: string
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

// Send an invitation
export async function sendInvitation(
  organizationId: string,
  email: string,
  role: string = 'member',
  captcha?: { captcha_id?: string, captcha_solution?: string, captcha_token?: string },
  role_id?: string,
  site_ids?: string[],
  app_url?: string,
): Promise<OrganizationInvitation> {
  const body: Record<string, unknown> = { email, role }

  if (role_id) body.role_id = role_id
  if (site_ids && site_ids.length > 0) body.site_ids = site_ids

  if (captcha?.captcha_id) body.captcha_id = captcha.captcha_id
  if (captcha?.captcha_solution) body.captcha_solution = captcha.captcha_solution
  if (captcha?.captcha_token) body.captcha_token = captcha.captcha_token

  if (app_url) body.app_url = app_url

  return await authFetch<OrganizationInvitation>(`/auth/organizations/${organizationId}/invites`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

// Accept an invitation by token (requires authentication)
export async function acceptInvitation(token: string): Promise<{ message: string; organization_id: string }> {
  return await authFetch<{ message: string; organization_id: string }>('/auth/invites/accept', {
    method: 'POST',
    body: JSON.stringify({ token }),
  })
}

// List invitations
export async function getInvitations(organizationId: string): Promise<OrganizationInvitation[]> {
  const data = await authFetch<{ invitations: OrganizationInvitation[] }>(`/auth/organizations/${organizationId}/invites`)
  return data.invitations || []
}

// Revoke invitation
export async function revokeInvitation(organizationId: string, inviteId: string): Promise<void> {
  await authFetch(`/auth/organizations/${organizationId}/invites/${inviteId}`, {
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
