'use client'

import { useState, useEffect } from 'react'
import { Button, Toggle, toast, Spinner } from '@ciphera-net/ui'
import { ShieldCheck } from '@phosphor-icons/react'
import { useSite, useBotFilterStats } from '@/lib/swr/dashboard'
import { updateSite } from '@/lib/api/sites'

export default function SiteBotSpamTab({ siteId }: { siteId: string }) {
  const { data: site, mutate } = useSite(siteId)
  const { data: botStats } = useBotFilterStats(siteId)
  const [filterBots, setFilterBots] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (site) setFilterBots(site.filter_bots ?? false)
  }, [site])

  const handleSave = async () => {
    setSaving(true)
    try {
      await updateSite(siteId, { name: site?.name || '', filter_bots: filterBots })
      await mutate()
      toast.success('Bot filtering updated')
    } catch {
      toast.error('Failed to save')
    } finally {
      setSaving(false)
    }
  }

  if (!site) return <div className="flex items-center justify-center py-12"><Spinner className="w-6 h-6 text-neutral-500" /></div>

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-white mb-1">Bot & Spam Filtering</h3>
        <p className="text-sm text-neutral-400">Automatically filter bot traffic and referrer spam from your analytics.</p>
      </div>

      {/* Bot filtering toggle */}
      <div className="flex items-center justify-between py-3 px-4 rounded-xl bg-neutral-800/30 border border-neutral-800">
        <div className="flex items-center gap-3">
          <ShieldCheck weight="bold" className="w-5 h-5 text-brand-orange" />
          <div>
            <p className="text-sm font-medium text-white">Enable bot filtering</p>
            <p className="text-xs text-neutral-400">Filter known bots, crawlers, referrer spam, and suspicious traffic.</p>
          </div>
        </div>
        <Toggle checked={filterBots} onChange={() => setFilterBots(p => !p)} />
      </div>

      {/* Stats */}
      {botStats && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-neutral-800 bg-neutral-800/30 p-4 text-center">
            <p className="text-2xl font-bold text-white">{botStats.filtered_sessions ?? 0}</p>
            <p className="text-xs text-neutral-400 mt-1">Sessions filtered</p>
          </div>
          <div className="rounded-xl border border-neutral-800 bg-neutral-800/30 p-4 text-center">
            <p className="text-2xl font-bold text-white">{botStats.filtered_events ?? 0}</p>
            <p className="text-xs text-neutral-400 mt-1">Events filtered</p>
          </div>
          <div className="rounded-xl border border-neutral-800 bg-neutral-800/30 p-4 text-center">
            <p className="text-2xl font-bold text-white">{botStats.auto_blocked_this_month ?? 0}</p>
            <p className="text-xs text-neutral-400 mt-1">Auto-blocked this month</p>
          </div>
        </div>
      )}

      <p className="text-sm text-neutral-400">
        For detailed session review and manual blocking, use the full{' '}
        <a href={`/sites/${siteId}/settings?tab=bot-spam`} className="text-brand-orange hover:underline">
          site settings page
        </a>.
      </p>

      <div className="flex justify-end pt-2">
        <Button onClick={handleSave} variant="primary" disabled={saving}>
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </div>
  )
}
