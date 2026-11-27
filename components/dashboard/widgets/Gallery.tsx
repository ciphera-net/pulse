'use client'
// Add a widget (ruling W11, look B of the round of 24-11-2026): Pulse's dialog, the blocks' orange tabs (From the
// pages, Dashboard blocks) over a grid of every widget not on the dashboard yet, each drawn small with the site's own
// numbers. A press picks one (orange border), a double press adds it; the footer holds its name, its sizes, Cancel
// and Add.
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Button, Switcher } from '@ciphera-net/facet'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { WIDGETS, sizeName, type FrameCtx, type WidgetDef } from './registry'
import { useWidgetsState, widgets, type WidgetSize } from './store'
import { SetupAction, SetupState } from './setup'
import { useFunnelListStats, useFunnels } from '@/lib/swr/dashboard'

/** A preview's box: the grid's cell at 1,440 px with the sidebar open (273 px a column, 215 px a row, 12 px gaps). */
const BOX: Record<WidgetSize, { w: number; h: number }> = {
  s: { w: 273, h: 215 },
  m: { w: 558, h: 215 },
  l: { w: 558, h: 442 },
  xl: { w: 1130, h: 442 },
  row: { w: 1130, h: 215 },
}

const GROUPS: { key: WidgetDef['group']; name: string }[] = [
  { key: 'pages', name: 'From the pages' },
  { key: 'blocks', name: 'Dashboard blocks' },
]

/** The widget itself, or the empty state that stands in for it when its page is not set up. */
function Live({ def, ctx, size }: { def: WidgetDef; ctx: FrameCtx; size: WidgetSize }) {
  return (
    <SetupState id={def.id} siteId={ctx.siteId} range={{ ...ctx.dateRange, period: ctx.period }}>
      {(unset) => (unset ? <SetupAction id={def.id} siteId={ctx.siteId} /> : def.render(ctx, size))}
    </SetupState>
  )
}

/** "Not set up": the colour in a dot, the words beside it. */
function NotSetUp({ def, ctx }: { def: WidgetDef; ctx: FrameCtx }) {
  return (
    <SetupState id={def.id} siteId={ctx.siteId} range={{ ...ctx.dateRange, period: ctx.period }}>
      {(unset) => (unset ? (
        <span className="ms-auto flex shrink-0 items-center gap-1.5 text-[11px] text-neutral-400" data-gallery-unset={def.id}>
          <span className="h-1.5 w-1.5 rounded-full bg-brand-orange" aria-hidden="true" />
          Not set up
        </span>
      ) : null)}
    </SetupState>
  )
}

function useGallery(ctx: FrameCtx, only?: WidgetDef['group']) {
  const s = useWidgetsState()
  const placed = useMemo(() => s.draft ?? [], [s.draft])
  const available = useMemo(
    () => WIDGETS.filter((w) => (w.multi || !placed.some((p) => p.id === w.id)) && (!only || w.group === only) && (w.shown ? w.shown(ctx) : true)),
    [placed, only, ctx],
  )
  const [pick, setPick] = useState<string | null>(null)
  const [size, setSize] = useState<WidgetSize | null>(null)
  const current = available.find((w) => w.id === pick) ?? available[0] ?? null
  const chosen: WidgetSize | null = current ? (size && current.sizes.includes(size) ? size : current.size) : null
  useEffect(() => { setSize(null) }, [current?.id])
  useEffect(() => { if (!s.galleryOpen) { setPick(null); setSize(null) } }, [s.galleryOpen])
  const close = () => widgets.openGallery(false)
  // A second Funnels widget starts on a funnel no Funnels widget shows yet, so it never repeats one.
  const { data: funnels } = useFunnels(ctx.siteId)
  const { data: funnelStats } = useFunnelListStats(ctx.siteId, ctx.dateRange.start, ctx.dateRange.end, ctx.filtersParam || undefined, ctx.period)
  // A new event tile starts on the event fired most that no event tile shows yet.
  const nextEvent = () => {
    const shown = new Set(placed.filter((p) => p.id.split(':')[0] === 'event').map((p) => p.event).filter(Boolean))
    return [...(ctx.dashboard?.goal_counts ?? [])].sort((a, b) => b.count - a.count).find((e) => !shown.has(e.event_name))?.event_name
  }
  const nextFunnel = () => {
    const shown = placed.filter((p) => p.id.split(':')[0] === 'funnels')
    if (shown.length === 0 || !funnels) return undefined
    // In the order the widget ranks them: most visitors entering first. "" (the one most enter) is the first of these.
    const ranked = [...funnels].sort((a, b) => (funnelStats?.[b.id]?.steps[0]?.visitors ?? 0) - (funnelStats?.[a.id]?.steps[0]?.visitors ?? 0))
    const used = new Set(shown.map((p) => p.funnel || ranked[0]?.id))
    return ranked.find((f) => !used.has(f.id))?.id
  }
  const add = (id = current?.id, z = chosen) => {
    if (!id || !z) return
    const def = WIDGETS.find((w) => w.id === id)
    widgets.add(id, z, { multi: def?.multi, funnel: id === 'funnels' ? nextFunnel() : undefined, event: id === 'event' ? nextEvent() : undefined })
    close()
  }
  return { open: s.galleryOpen, available, current, chosen, setPick, setSize, close, add }
}
type G = ReturnType<typeof useGallery>

function SizeSwitch({ def, value, onChange }: { def: WidgetDef; value: WidgetSize; onChange: (z: WidgetSize) => void }) {
  const sizes = def.sizes
  if (sizes.length < 2) return <span className="text-xs text-neutral-500">{sizeName(def, value)}</span>
  return <Switcher size="sm" aria-label="Size" options={sizes.map((z) => ({ value: z, label: sizeName(def, z) }))} value={value} onChange={(v) => onChange(v as WidgetSize)} />
}

function Footer({ g, left }: { g: G; left?: ReactNode }) {
  return (
    <div className="flex items-center justify-end gap-2 pt-4">
      {left && <div className="me-auto flex min-w-0 items-center gap-3">{left}</div>}
      <Button variant="outline" onClick={g.close}>Cancel</Button>
      <Button onClick={() => g.add()} disabled={!g.current} data-gallery-add="">Add to the dashboard</Button>
    </div>
  )
}

function Tabs({ g, tab, setTab }: { g: G; tab: WidgetDef['group']; setTab: (t: WidgetDef['group']) => void }) {
  const groups = GROUPS.filter((x) => g.available.some((w) => w.group === x.key))
  if (groups.length < 2) return null
  return (
    <div className="pb-4">
      <Switcher size="sm" tone="solid" aria-label="Kind of widget" options={groups.map((x) => ({ value: x.key, label: x.name }))} value={tab} onChange={(v) => setTab(v as WidgetDef['group'])} />
    </div>
  )
}

/** The tab on show: the one asked for while it has widgets, else the first that has any. */
function useTab(g: G) {
  const [tab, setTab] = useState<WidgetDef['group']>('pages')
  const groups = GROUPS.filter((x) => g.available.some((w) => w.group === x.key))
  const shown = groups.some((x) => x.key === tab) ? tab : groups[0]?.key ?? 'pages'
  return [shown, setTab] as const
}

const EMPTY = <p className="py-10 text-center text-sm text-neutral-400" data-gallery-empty="">Every widget is on your dashboard already.</p>

const CARD_W = 290
const CARD_H = 170
function LivePreviews({ ctx, only }: { ctx: FrameCtx; only?: WidgetDef['group'] }) {
  const g = useGallery(ctx, only)
  const [tab, setTab] = useTab(g)
  const list = g.available.filter((w) => w.group === tab)
  const inTab = list.find((w) => w.id === g.current?.id) ?? list[0] ?? null
  useEffect(() => { if (inTab && inTab.id !== g.current?.id) g.setPick(inTab.id) }, [inTab?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    // Pulse's own glass dialog (components/ui/dialog.tsx), as the Copy to other sites dialog and the funnel dialog.
    <Dialog open={g.open} onOpenChange={(open) => { if (!open) g.close() }}>
      <DialogContent className="flex max-h-[90vh] w-[min(94vw,1000px)] max-w-none flex-col gap-0 p-0 sm:max-w-none" data-gallery-dialog="">
        <div className="shrink-0 border-b border-border px-6 py-4">
          <DialogTitle className="text-lg font-semibold text-white">Add a widget</DialogTitle>
        </div>
        <div className="min-h-0 flex-1 px-6 py-5">
      {!g.current || !g.chosen ? EMPTY : (
        <div data-gallery="" data-gallery-look="b">
          <Tabs g={g} tab={tab} setTab={setTab} />
          <div className="grid max-h-[520px] grid-cols-1 gap-3 overflow-y-auto pe-1 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((w) => {
              const on = w.id === g.current?.id
              const Icon = w.icon
              const box = BOX[w.size]
              const zoom = Math.min(CARD_W / box.w, CARD_H / box.h)
              return (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => g.setPick(w.id)}
                  onDoubleClick={() => g.add(w.id, w.size)}
                  aria-pressed={on}
                  className={`flex flex-col border text-left transition-colors duration-fast ease-apple focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange ${on ? 'border-brand-orange' : 'border-white/[0.08] hover:border-white/[0.16]'}`}
                  data-gallery-item={w.id}
                >
                  <span className="flex h-[186px] items-center justify-center overflow-hidden bg-black/20" aria-hidden="true">
                    <span className="pointer-events-none block shrink-0" style={{ width: box.w, height: box.h, zoom }}>
                      <Live def={w} ctx={ctx} size={w.size} />
                    </span>
                  </span>
                  <span className="flex min-w-0 items-center gap-2 border-t border-white/[0.08] px-3 py-2.5 text-sm text-white">
                    <Icon className={`h-4 w-4 shrink-0 ${on ? 'text-brand-ink' : 'text-neutral-400'}`} />
                    <span className="truncate">{w.name}</span>
                    <NotSetUp def={w} ctx={ctx} />
                  </span>
                </button>
              )
            })}
          </div>
          <Footer
            g={g}
            left={g.current && g.chosen ? (
              <>
                <span className="truncate text-sm text-white">{g.current.name}</span>
                <SizeSwitch def={g.current} value={g.chosen} onChange={g.setSize} />
              </>
            ) : null}
          />
        </div>
      )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default function Gallery({ ctx }: { ctx: FrameCtx }) {
  return <LivePreviews ctx={ctx} />
}
