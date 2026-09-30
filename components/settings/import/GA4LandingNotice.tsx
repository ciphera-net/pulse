'use client'

import { useEffect } from 'react'
import { toast } from '@ciphera-net/facet'
import { ga4CallbackMessage } from '@/lib/import/messages'

/**
 * GA4's callback code on a LANDING page (PULSE-140, M5-b). A sign-in whose
 * OAuth state fails to verify has no trustworthy site to go back to, so the
 * backend lands the Google popup on `/?ga4=invalid_state`; signed in, the
 * middleware carries the code on to /sites. This says it the way the Search
 * Console result is said on its landing page (`?gsc=`): a toast, then the code
 * is scrubbed from the address so a reload doesn't say it again.
 *
 * A code that did reach a site lands on the Import tab instead, which says it
 * in the GA4 row (SiteImportTab). Renders nothing.
 */
export function GA4LandingNotice() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('ga4')
    if (code === null) return
    const message = ga4CallbackMessage(code)
    if (message) toast.error(message.text)
    params.delete('ga4')
    const rest = params.toString()
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${rest ? `?${rest}` : ''}${window.location.hash}`)
  }, [])
  return null
}
