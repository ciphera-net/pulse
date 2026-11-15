'use client'

import { useEffect } from 'react'
import { useAuth } from '@/lib/auth/context'
import { NEW_DASHBOARD_FLAG } from '@/lib/dashboard/frame'
import { useFeature } from '@/lib/features'
import { setNewLook } from '@/lib/skeleton/look'

/**
 * Keeps this device's copy of "the team has the new dashboard" right (lib/skeleton/look.ts says what the copy is
 * for). The script in the root layout paints with the copy before React runs; this corrects it once /me has
 * answered, and follows a switch made in Settings → Beta or a change of team.
 *
 * It writes only on an ANSWER. Signed out, and while /me is still on its way, the copy stands as it is: a login
 * page must not forget what the dashboard behind it looks like, or the first skeleton after signing in would be
 * the wrong one.
 *
 * Renders nothing. The one writer of the class after the script.
 */
export default function NewDashboardLookSync() {
  const { user } = useAuth()
  const on = useFeature(NEW_DASHBOARD_FLAG)

  useEffect(() => {
    if (!user || on === null) return
    setNewLook(on)
  }, [user, on])

  return null
}
