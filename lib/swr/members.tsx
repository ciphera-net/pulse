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

  return { members: data ?? [], error, isLoading }
}
