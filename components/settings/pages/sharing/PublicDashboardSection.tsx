'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { InputGroup, InputGroupButton, InputGroupInput, Toggle, toast } from '@ciphera-net/facet'
import { CheckCircle, Copy, Globe } from '@phosphor-icons/react'
import { updateSite, type Site } from '@/lib/api/sites'
import { env } from '@/lib/env'
import { KitBlock, KitRow, KitRows, KitSection, KitStatus } from '@/components/settings/kit/Kit'
import SettingsSaveBar from '@/components/settings/SettingsSaveBar'

/**
 * Sharing → Public dashboard (copy deck §6.2): one switch and, while it is on, the share link. Owners and admins only
 * (R23: a member never sees this section). The switch is a draft saved with the page's save bar, as Visibility's was;
 * the public dashboard password is gone (R2).
 */
export function PublicDashboardSection({ site, onSaved }: { site: Site; onSaved: () => Promise<unknown> }) {
  // The saved state and the draft. Read once from the site: the page is mounted afresh for each site.
  const [baseline, setBaseline] = useState(() => site.is_public ?? false)
  const [isPublic, setIsPublic] = useState(baseline)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  // The "Copied" reset is cleared on unmount, so no timer outlives the page.
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (copiedTimer.current) clearTimeout(copiedTimer.current)
  }, [])

  const shareUrl = `${env.NEXT_PUBLIC_APP_URL}/share/${site.id}`
  const isDirty = isPublic !== baseline
  // The link's state follows what is SAVED: it opens only once the switch is saved.
  const live = !!site.is_public

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      // `clear_password` keeps R2 true for any site that still has a password from before: the public dashboard
      // opens with the link alone. Every other field is left as it is (omitted fields keep their stored value).
      await updateSite(site.id, { name: site.name, is_public: isPublic, clear_password: true })
    } catch (err) {
      toast.error("Couldn't save. Try again.")
      // Rejected, so the bar keeps the draft and never says "Saved".
      throw err
    } finally {
      setSaving(false)
    }
    // No toast on success: the bar says Saved (copy deck §6.6).
    setBaseline(isPublic)
    await onSaved()
  }, [site.id, site.name, isPublic, onSaved])

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      toast.success('Link copied')
      if (copiedTimer.current) clearTimeout(copiedTimer.current)
      copiedTimer.current = setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error("Couldn't copy the link. Select it and copy it by hand.")
    }
  }

  return (
    <>
      <KitSection title="Public dashboard" description="Let anyone with the link see this site's dashboard." icon={<Globe />}>
        <KitRows>
          <KitRow
            label="Make the dashboard public"
            caption="Anyone with the link sees the dashboard, read-only. Your other pages, your settings and single visitors stay private."
            htmlFor="site-public-dashboard"
            control={<Toggle id="site-public-dashboard" checked={isPublic} onChange={() => setIsPublic((v) => !v)} disabled={saving} />}
          />
          {isPublic && (
            // The link has the row's whole width (General's script block), so the address is never cut off.
            <KitBlock>
              <div data-sharing-linkrow="">
                <div className="flex items-start justify-between gap-6">
                  <div className="min-w-0">
                    <label htmlFor="site-share-link" className="block text-sm font-medium text-foreground">
                      Share link
                    </label>
                    <p className="mt-0.5 max-w-[56ch] text-xs text-muted-foreground">
                      The link stays the same. Turn the public dashboard off to stop it working.
                    </p>
                  </div>
                  <span className="shrink-0 pt-0.5 text-xs">
                    <KitStatus tone={live ? 'live' : 'off'}>{live ? 'Live' : 'Live once you save'}</KitStatus>
                  </span>
                </div>
                <InputGroup className="mt-3">
                  {/* A web address is machine text: the one monospace on the page. */}
                  <InputGroupInput id="site-share-link" data-sharing-link="" value={shareUrl} readOnly className="font-mono text-xs" />
                  <InputGroupButton type="button" variant="ghost" size="xs" onClick={copyLink} aria-label="Copy share link">
                    {copied ? <CheckCircle weight="bold" className="h-3.5 w-3.5" /> : <Copy weight="bold" className="h-3.5 w-3.5" />}
                    <span className="ml-1">{copied ? 'Copied' : 'Copy link'}</span>
                  </InputGroupButton>
                </InputGroup>
              </div>
            </KitBlock>
          )}
        </KitRows>
      </KitSection>

      <SettingsSaveBar isDirty={isDirty} onSave={handleSave} onDiscard={() => setIsPublic(baseline)} />
    </>
  )
}
