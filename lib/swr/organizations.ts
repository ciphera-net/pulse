'use client'
import useSWR from 'swr'
import { getUserOrganizations, type OrganizationMember } from '@/lib/api/organization'
import { useAuth } from '@/lib/auth/context'

/**
 * The organizations the signed-in person belongs to, fetched once and shared.
 *
 * Both top bars (the desktop GlassTopBar and the mobile ContentHeader) mount
 * the user menu at the same time, and the team-state signal reads the same
 * list, so it lives under one SWR key rather than in each caller's state. The
 * key carries the user id: another person signing in on this browser must
 * never be answered with the previous person's list.
 *
 * An org switch goes through AuthProvider.refresh(), whose cache-wide
 * clear-and-revalidate (lib/swr/org-switch.ts) refetches this key too.
 *
 * `organizations` is null until the first answer arrives, never an empty
 * list standing in for "not loaded yet".
 */
export function useUserOrganizations() {
  const { user } = useAuth()
  const userId = user?.id ?? null

  const { data, error, isLoading, mutate } = useSWR<OrganizationMember[]>(
    userId ? ['user-organizations', userId] : null,
    async () => {
      const organizations = await getUserOrganizations()
      return Array.isArray(organizations) ? organizations : []
    },
    {
      revalidateOnFocus: false,
      dedupingInterval: 60_000,
    },
  )

  // `mutate` re-reads the list, for a caller that has just changed what it
  // holds (a rename), so the user menu does not keep the old name.
  return { organizations: data ?? null, error, isLoading, mutate }
}
