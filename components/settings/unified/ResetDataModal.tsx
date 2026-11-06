'use client'

import { useState } from 'react'
import { Checkbox, toast } from '@ciphera-net/facet'
import { HoldDialog, useUndo } from '@ciphera-net/facet-hold'
import { ArrowCounterClockwise, WarningCircle } from '@phosphor-icons/react'
import { whilePending } from '@/lib/hold/pending'
import { resetSiteData, type ResetModule } from '@/lib/api/sites'
import { KitDialogRow, KitDialogTitle, KitWarningLine } from '@/components/settings/kit/Kit'

/**
 * Reset data, General's dialog (settings overhaul R11, style C: the kit inside the dialog, the list in two groups;
 * copy deck §3.8). "Permanently" was not true of Bunny CDN and Search Console, which Pulse fetches again from the
 * service, so they are their own group (finding 8).
 */
const MODULES: { id: ResetModule; label: string; caption: string; refetched?: boolean }[] = [
  { id: 'analytics', label: 'Visits and events', caption: 'Every pageview, visit and event, and the totals made from them. An import in progress stops.' },
  { id: 'journeys', label: 'Journeys', caption: 'The paths people take from page to page.' },
  { id: 'funnels', label: 'Funnels and goals', caption: 'The funnels and goals themselves, not only their numbers.' },
  { id: 'uptime', label: 'Uptime history', caption: 'Checks, daily uptime and incidents. Your monitor stays.' },
  { id: 'pagespeed', label: 'Performance history', caption: 'Past performance checks. Your check settings stay.' },
  { id: 'cdn', label: 'Bunny CDN', caption: "Pulse's copy of your bandwidth data. Pulse fetches it again from Bunny.", refetched: true },
  { id: 'search_console', label: 'Search Console', caption: "Pulse's copy of your search data. Pulse fetches it again from Google.", refetched: true },
]

interface ResetDataModalProps {
  open: boolean
  onClose: () => void
  onReset: () => void
  siteDomain: string
  siteId: string
}

/** The Undo bar's line, past tense, naming what was picked (PUL-28). */
function resetMessage(selected: Set<ResetModule>): string {
  if (selected.size === MODULES.length) return 'All data reset'
  const labels = MODULES.filter((m) => selected.has(m.id)).map((m) => m.label)
  // Two labels joined by "and" would read "Visits and events and Journeys", so more than one is counted.
  if (labels.length === 1) return `${labels[0]} reset`
  return `${labels.length} kinds of data reset`
}

export default function ResetDataModal({ open, onClose, onReset, siteDomain, siteId }: ResetDataModalProps) {
  const [selected, setSelected] = useState<Set<ResetModule>>(new Set())
  const { defer } = useUndo()
  const all = selected.size === MODULES.length

  const handleClose = () => {
    setSelected(new Set())
    onClose()
  }
  const toggle = (id: ResetModule) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const toggleAll = () => setSelected(all ? new Set() : new Set(MODULES.map((m) => m.id)))

  // Nothing to hide: resetting data does not remove a row from any list, so this goes straight through useUndo()
  // rather than useDeferredRemoval. The failure says its own words (Facet's helper would replace them).
  const handleConfirm = () => {
    if (selected.size === 0) return
    const modules = Array.from(selected)
    defer(whilePending(`reset:${siteId}`, {
      message: resetMessage(selected),
      commit: ({ keepalive }) => resetSiteData(siteId, modules, { keepalive }),
      onCommitted: () => onReset(),
      onError: () => toast.error("Couldn't reset data. Try again."),
    }))
    setSelected(new Set())
  }

  const row = (m: (typeof MODULES)[number]) => (
    <KitDialogRow
      key={m.id}
      label={m.label}
      caption={m.caption}
      control={<Checkbox checked={selected.has(m.id)} onChange={() => toggle(m.id)} aria-label={m.label} />}
    />
  )
  const group = (heading: string, items: typeof MODULES) => (
    <div data-dialog-group={heading}>
      <p className="pb-1 pt-4 text-xs font-medium text-muted-foreground">{heading}</p>
      {items.map(row)}
    </div>
  )

  return (
    <HoldDialog
      open={open}
      onOpenChange={(isOpen) => { if (!isOpen) handleClose() }}
      title={<KitDialogTitle icon={<ArrowCounterClockwise weight="bold" />}>Reset data for {siteDomain}?</KitDialogTitle>}
      description="Pick what to delete. Connected services stay connected."
      holdLabel="Hold to reset"
      icon={<ArrowCounterClockwise weight="bold" className="h-4 w-4" aria-hidden="true" />}
      disabled={selected.size === 0}
      onConfirm={handleConfirm}
      className="max-w-[480px]"
    >
      <div data-dialog-style="groups">
        <KitDialogRow
          label="Everything"
          caption={`${selected.size} of ${MODULES.length} picked`}
          control={<Checkbox checked={all} indeterminate={selected.size > 0 && !all} onChange={toggleAll} aria-label="Everything" />}
        />
        {group('Deleted for good', MODULES.filter((m) => !m.refetched))}
        {group('Fetched again', MODULES.filter((m) => m.refetched))}
        {/* Kept in the layout while nothing is picked, so the dialog does not jump when the first box is ticked. */}
        <div className={selected.size === 0 ? 'invisible border-t border-border pt-4' : 'border-t border-border pt-4'}>
          <KitWarningLine icon={<WarningCircle weight="fill" />}>After 6 seconds this can&apos;t be undone.</KitWarningLine>
        </div>
      </div>
    </HoldDialog>
  )
}
