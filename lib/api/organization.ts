import { authFetch } from './client'

export interface Organization {
  id: string
  name: string
  slug: string
  created_at: string
  // Pulse's own organizations table has no plan concept of its own (billing
  // reads Warden separately); nothing in this app still reads this, but the
  // field is kept optional rather than deleted outright in case an older
  // cached `Organization` is still sitting in someone's localStorage.
  plan_tier?: string
  updated_at?: string
  onboarding_completed_at: string | null
}

export interface OrganizationMember {
  organization_id: string
  user_id: string
  role: 'owner' | 'admin' | 'member'
  joined_at: string
  // Pulse's own answer, not ciphera-id's: when this member last used the
  // team. Absent on a row that has not been touched since the column shipped.
  last_active_at?: string | null
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

// Create a new team
export async function createOrganization(name: string, slug: string): Promise<Organization> {
  // * authFetch returns the parsed JSON body, not the Response object.
  return await authFetch<Organization>('/organizations', {
    method: 'POST',
    body: JSON.stringify({ name, slug }),
  })
}

/** What ensure-default answers with. `created` distinguishes a workspace this
 *  call made from one the account already had. */
export interface EnsureDefaultOrganizationResult {
  created: boolean
  organization: { id: string; name: string; slug: string }
}

/**
 * Give this account a workspace if it has none, and answer with its primary
 * either way.
 *
 * 🔴 IDEMPOTENT AND SERIALISED SERVER-SIDE, which is what lets both call sites
 * (the auth callback and the org wall) fire without racing to create two.
 * Pulse generates the name — it owns team names now (PULSE-92 Phase 5) — so
 * there is nothing to pass.
 *
 * ⚠️ NEVER call this on the /join path. Someone accepting an invite has no
 * workspace yet and must not be handed a stray one; the server cannot know an
 * invite is pending, so the exemption is ours to keep.
 */
/**
 * Whether a sign-in landing on `target` should be given a default workspace.
 *
 * 🔴 THE ONE RULE, AND WHY IT IS A FUNCTION. Somebody arriving on a /join link
 * is about to belong to somebody else's workspace. Provisioning one for them
 * first leaves a stray, permanently, named after nothing they chose — and the
 * server cannot make this call, because only Pulse knows an invite is pending.
 * It lives here, exported and tested, rather than inline in a callback nobody
 * can reach from a test.
 */
export function shouldProvisionWorkspace(target: string | null | undefined): boolean {
  return !(target ?? '').startsWith('/join')
}

export async function ensureDefaultOrganization(): Promise<EnsureDefaultOrganizationResult> {
  return await authFetch<EnsureDefaultOrganizationResult>('/organizations/ensure-default', {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

// List the teams this account belongs to
export async function getUserOrganizations(): Promise<OrganizationMember[]> {
  const data = await authFetch<{ organizations: OrganizationMember[] }>('/organizations')
  return data.organizations || []
}

// Get team details
export async function getOrganization(organizationId: string): Promise<Organization> {
  return await authFetch<Organization>(`/organizations/${organizationId}`)
}

// Delete a team
export async function deleteOrganization(organizationId: string): Promise<void> {
  await authFetch(`/organizations/${organizationId}`, {
    method: 'DELETE',
  })
}

export async function completeOnboarding(organizationId: string): Promise<void> {
  await authFetch(`/organizations/${organizationId}/complete-onboarding`, {
    method: 'POST',
  })
}

// Update team details
export async function updateOrganization(organizationId: string, name: string, slug: string): Promise<Organization> {
  return await authFetch<Organization>(`/organizations/${organizationId}`, {
    method: 'PUT',
    body: JSON.stringify({ name, slug }),
  })
}

// Get team members
export async function getOrganizationMembers(organizationId: string): Promise<OrganizationMember[]> {
  const data = await authFetch<{ members: OrganizationMember[] }>(`/organizations/${organizationId}/members`)
  return data.members || []
}

// Remove a member from the team
export async function removeOrganizationMember(organizationId: string, userId: string): Promise<void> {
  await authFetch(`/organizations/${organizationId}/members/${userId}`, {
    method: 'DELETE',
  })
}

// Leave a team. The owner is refused server-side (409) — the caller must
// transfer ownership first; the UI keeps the row disabled for the owner
// rather than round-tripping to find that out.
export async function leaveOrganization(organizationId: string): Promise<void> {
  await authFetch(`/organizations/${organizationId}/leave`, {
    method: 'POST',
  })
}

// Transfer ownership of a team to another member.
// After a successful transfer the caller becomes a regular member.
export async function transferOwnership(organizationId: string, targetUserId: string): Promise<void> {
  await authFetch(`/organizations/${organizationId}/transfer-ownership`, {
    method: 'POST',
    body: JSON.stringify({ target_user_id: targetUserId }),
  })
}

export async function createInviteLink(
  orgId: string,
  params: { name: string; role: string; metadata?: object; max_uses?: number; expires_in: string }
): Promise<InviteLink> {
  return await authFetch<InviteLink>(`/organizations/${orgId}/invite-links`, {
    method: 'POST',
    body: JSON.stringify(params),
  })
}

export async function getInviteLinks(orgId: string): Promise<InviteLink[]> {
  const data = await authFetch<{ invite_links: InviteLink[] }>(`/organizations/${orgId}/invite-links`)
  return data.invite_links ?? []
}

export async function revokeInviteLink(orgId: string, linkId: string): Promise<void> {
  await authFetch(`/organizations/${orgId}/invite-links/${linkId}`, { method: 'DELETE' })
}

export async function acceptInviteLink(code: string): Promise<{ organization_id: string; metadata?: object }> {
  return await authFetch<{ organization_id: string; metadata?: object }>(`/invite-links/${code}/accept`, {
    method: 'POST',
  })
}
