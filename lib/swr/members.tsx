'use client'
import useSWR from 'swr'
import { getOrganizationMembers, type OrganizationMember } from '@/lib/api/organization'
import { useAuth } from '@/lib/auth/context'

export type { OrganizationMember }

export function useMembers() {
  const { user } = useAuth()
  const orgId = user?.org_id ?? null

  const { data, error, isLoading } = useSWR<OrganizationMember[]>(
    orgId ? ['members', orgId] : null,
    ([, id]: [string, string]) => getOrganizationMembers(id),
    {
      revalidateOnFocus: false,
      dedupingInterval: 60_000,
    },
  )

  // `list` is null until the first answer arrives; `members` keeps the
  // historical empty-array shape for callers that only render the rows.
  return { members: data ?? [], list: data ?? null, error, isLoading }
}
