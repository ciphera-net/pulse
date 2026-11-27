'use client'
// Copy this site's layout to the team's other sites (review W20, A3, 27-11-2026: the Customize bar's button; owner W21:
// "make the pop up same like other pop ups. glass."). Pulse's own glass dialog (components/ui/dialog.tsx, the funnel dialog's): the title in
// a strip, the team's other sites as checkboxes, the buttons in a strip at the foot. Facet's Modal is glass too, but
// its 60% overlay over Customize's 90% veils left nothing behind the panel to blur, so it read as solid. Each picked
// site gets the layout as its team's (its own is replaced); a widget's funnel or event that site does not have falls
// back to its first, as on any site.
import { useState } from 'react'
import { Button, Checkbox, toast } from '@ciphera-net/facet'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { useSites } from '@/lib/swr/sites'
import { resetDashboardLayout, saveDashboardLayout } from '@/lib/api/dashboardLayout'
import { isDefaultLayout, useWidgetsState, widgets, type Placed } from './store'

export default function CopyLayout({ siteId }: { siteId: string }) {
  const { copying } = useWidgetsState()
  const close = () => widgets.openCopy(null)
  return (
    <Dialog open={copying !== null} onOpenChange={(open) => { if (!open) close() }}>
      {/* The body mounts with the dialog, so each opening starts with nothing ticked. */}
      {copying !== null && <CopyBody siteId={siteId} copying={copying} close={close} />}
    </Dialog>
  )
}

function CopyBody({ siteId, copying, close }: { siteId: string; copying: Placed[]; close: () => void }) {
  const { sites } = useSites()
  const others = sites.filter((s) => s.id !== siteId)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const all = others.length > 0 && picked.size === others.length
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const copy = async () => {
    setBusy(true)
    const results = await Promise.allSettled([...picked].map((id) => (isDefaultLayout(copying) ? resetDashboardLayout(id) : saveDashboardLayout(id, copying))))
    setBusy(false)
    const failed = results.filter((r) => r.status === 'rejected').length
    const done = results.length - failed
    if (failed === 0) toast.success(done === 1 ? 'Copied to 1 site.' : `Copied to ${done} sites.`)
    else toast.error(`Copied to ${done} of ${results.length} sites. Try the others again.`)
    close()
  }
  const label = picked.size === 0 ? 'Copy' : picked.size === 1 ? 'Copy to 1 site' : `Copy to ${picked.size} sites`
  return (
    <DialogContent className="flex max-h-[85vh] w-full flex-col gap-0 p-0 sm:max-w-[480px]" data-copy-layout="">
      <div className="shrink-0 border-b border-border px-6 py-4">
        <DialogTitle className="text-lg font-semibold text-white">Copy this layout to other sites</DialogTitle>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <DialogDescription className="text-sm text-neutral-400">Each site you pick gets this layout for its whole team, in place of its own.</DialogDescription>
        {others.length === 0 ? (
          <p className="pt-5 text-sm text-neutral-400">This team has no other site.</p>
        ) : (
          <div className="mt-5 space-y-3">
            <Checkbox checked={all} indeterminate={picked.size > 0 && !all} onChange={() => setPicked(all ? new Set() : new Set(others.map((s) => s.id)))} label="All the team's other sites" />
            <div className="space-y-3 border-t border-border pt-3">
              {others.map((s) => (
                <Checkbox key={s.id} checked={picked.has(s.id)} onChange={() => toggle(s.id)} label={<span>{s.name} <span className="text-neutral-500">{s.domain}</span></span>} />
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="flex shrink-0 justify-end gap-2 border-t border-border px-6 py-3">
        <Button variant="outline" onClick={close}>Cancel</Button>
        <Button onClick={() => { void copy() }} disabled={picked.size === 0 || busy} data-copy-go="">
          {busy ? 'Copying' : label}
        </Button>
      </div>
    </DialogContent>
  )
}
