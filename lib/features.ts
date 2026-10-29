'use client'

import useSWR from 'swr'
import { getMe } from '@/lib/api/me'
import { useAuth } from '@/lib/auth/context'
import { useOptionalSiteScope } from '@/lib/scope/SiteScope'

// Feature flags for the ACTIVE team (OPS-27): the betas a team or a person has been given, switched
// on and off without a deploy. pulse-backend evaluates them and lists each team's on-flags in
// GET /api/v1/me (`teams[].features`); the browser never asks anything else.
//
// 🔴 THIS DECIDES WHAT THE SCREEN SHOWS, NOT WHAT IS ALLOWED. This repository is public, so a beta's
// screens are readable by anyone. Its API routes are closed on the server (pulse-backend's
// RequireFeature answers 404 while the flag is off). Gate the screen here AND the route there.
//
// Returns `null` until /me has answered, and stays `null` if it fails: render nothing for a gated
// screen until it is `true`, so a beta never flashes on and off and an error keeps it closed. A
// team switch needs no new request, because /me lists every team. A flag switched on while the
// page is open shows within 5 minutes (the dedupe window) or on the next load. A public page
// (/demo, a share link) offers no beta and asks nothing.
export function useFeature(flag: string): boolean | null {
  const { user } = useAuth()
  const isPublic = useOptionalSiteScope()?.mode === 'public'
  const { data } = useSWR(user && !isPublic ? '/api/v1/me' : null, () => getMe(), {
    revalidateOnFocus: false,
    dedupingInterval: 300_000,
  })
  if (isPublic || !user) return false
  if (!data) return null
  const team = data.teams.find((t) => t.id === user.org_id)
  return Boolean(team?.features?.includes(flag))
}
