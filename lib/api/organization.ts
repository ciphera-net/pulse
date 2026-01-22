import apiRequest from './client'

export interface Organization {
  id: string
  name: string
  slug: string
  role: 'owner' | 'admin' | 'member'
  joined_at: string
}

export interface OrganizationMember {
  organization_id: string
  user_id: string
  role: string
  joined_at: string
  organization_name: string
  organization_slug: string
}

// * Fetch user's organizations
export async function getUserOrganizations(): Promise<{ organizations: OrganizationMember[] }> {
  // * Route to Auth Service
  // * Note: The client.ts prepends /api/v1, but the auth service routes are /api/v1/auth/organizations
  // * We need to be careful with the prefix.
  // * client.ts: if endpoint starts with /auth, it uses AUTH_API_URL + /api/v1 + endpoint
  // * So if we pass /auth/organizations, it becomes AUTH_API_URL/api/v1/auth/organizations
  // * This matches the router group in main.go: v1.Group("/auth").Group("/organizations")
  return apiRequest<{ organizations: OrganizationMember[] }>('/auth/organizations')
}

// * Create a new organization
export async function createOrganization(name: string, slug: string): Promise<Organization> {
  return apiRequest<Organization>('/auth/organizations', {
    method: 'POST',
    body: JSON.stringify({ name, slug }),
  })
}

// * Switch context to organization (returns new token)
export async function switchContext(organizationId: string): Promise<{ access_token: string }> {
  // * Route in main.go is /api/v1/auth/switch-context
  return apiRequest<{ access_token: string }>('/auth/switch-context', {
    method: 'POST',
    body: JSON.stringify({ organization_id: organizationId }),
  })
}
