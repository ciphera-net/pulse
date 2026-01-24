import { authFetch } from './client'

export interface Organization {
  id: string
  name: string
  slug: string
  plan_tier: string
  created_at: string
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
  // Use authFetch (Authenticated via Ciphera Auth)
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
  console.log('Sending switch context request:', payload)
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

// Send an invitation
export async function sendInvitation(
  organizationId: string, 
  email: string, 
  role: string = 'member',
  captcha?: { captcha_id?: string, captcha_solution?: string, captcha_token?: string }
): Promise<OrganizationInvitation> {
  const body = {
    email,
    role,
    ...(captcha?.captcha_id ? { captcha_id: captcha.captcha_id } : {}),
    ...(captcha?.captcha_solution ? { captcha_solution: captcha.captcha_solution } : {}),
    ...(captcha?.captcha_token ? { captcha_token: captcha.captcha_token } : {})
  }
  
  return await authFetch<OrganizationInvitation>(`/auth/organizations/${organizationId}/invites`, {
    method: 'POST',
    body: JSON.stringify(body),
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
