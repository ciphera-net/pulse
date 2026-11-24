'use client'
// The site dashboard's widgets (PUL-88, beta `dashboard-widgets`; plan Pulse/docs/plans/24-11-2026-dashboard-widgets-
// build-plan.md). The SAVED layout is the team's and lives on the server (lib/api/dashboardLayout.ts, read through
// useDashboardWidgets below). This store holds only what this page knows: whether Customize is on, the draft it edits,
// the gallery, and the widget a press last moved (for its brief outline). Done sends the draft; Cancel drops it.
import { useSyncExternalStore } from 'react'
import { useCan } from '@/lib/auth/permissions'
import { useFeature } from '@/lib/features'
import { useOptionalSiteScope } from '@/lib/scope/SiteScope'
import { useSiteSWR } from '@/lib/swr/site-read'
import { getDashboardLayout, resetDashboardLayout, saveDashboardLayout, type PlacedWidget, type WidgetSize } from '@/lib/api/dashboardLayout'

export type { WidgetSize }
export type Placed = PlacedWidget

export const DASHBOARD_WIDGETS_FLAG = 'dashboard-widgets'

/** Today's dashboard, in the grid's terms: the chart, the five blocks, the pair under them, the three overviews. */
export const DEFAULT_LAYOUT: Placed[] = [
  { id: 'chart', size: 'xl' },
  { id: 'sources', size: 'l' },
  { id: 'pages', size: 'l' },
  { id: 'locations', size: 'l' },
  { id: 'technology', size: 'l' },
  { id: 'events', size: 'xl' },
  { id: 'conversion', size: 'l' },
  { id: 'week', size: 'l' },
  { id: 'search', size: 's' },
  { id: 'uptime', size: 's' },
  { id: 'performance', size: 'm' },
]

interface State {
  editing: boolean
  /** Customize's copy: Done sends it, Cancel drops it. */
  draft: Placed[] | null
  galleryOpen: boolean
  /** The widget a press or the keyboard last moved, for the brief orange outline after a move. */
  moved: string | null
  saving: boolean
  /** Why the last Done failed; Customize stays open with the draft while it is set. */
  error: string | null
}

const IDLE: State = { editing: false, draft: null, galleryOpen: false, moved: null, saving: false, error: null }
let state: State = IDLE
const listeners = new Set<() => void>()
function set(next: Partial<State>) {
  state = { ...state, ...next }
  listeners.forEach((l) => l())
}
function subscribe(l: () => void) {
  listeners.add(l)
  return () => { listeners.delete(l) }
}

export function useWidgetsState(): State {
  return useSyncExternalStore(subscribe, () => state, () => IDLE)
}

/** Changes the draft; outside Customize nothing changes (the layout is the team's, and only Done saves it). */
function write(list: Placed[], moved: string | null = null) {
  if (!state.editing || !state.draft) return
  set({ draft: list, moved })
}

export const widgets = {
  startEdit(saved: Placed[]) { set({ ...IDLE, editing: true, draft: [...saved] }) },
  cancelEdit() { set(IDLE) },
  /** Back to today's dashboard, in the draft: Done saves it as "no layout". */
  reset() { write(DEFAULT_LAYOUT.map((p) => ({ ...p }))) },
  move(from: number, to: number) {
    const list = [...(state.draft ?? [])]
    if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return
    const [item] = list.splice(from, 1)
    list.splice(to, 0, item)
    write(list, item.id)
  },
  /** The order a drag ended on. */
  commit(list: Placed[], moved: string | null) { write(list, moved) },
  setSize(id: string, size: WidgetSize) { write((state.draft ?? []).map((p) => (p.id === id ? { ...p, size } : p)), id) },
  setView(id: string, view: string) { write((state.draft ?? []).map((p) => (p.id === id ? { ...p, view } : p))) },
  setFunnel(id: string, funnel: string) {
    write((state.draft ?? []).map((p) => {
      if (p.id !== id) return p
      return funnel ? { ...p, funnel } : { id: p.id, size: p.size, ...(p.view ? { view: p.view } : {}) }
    }), id)
  },
  remove(id: string) { write((state.draft ?? []).filter((p) => p.id !== id)) },
  /** A widget that may be there more than once gets the next free instance id (`funnels:2`). */
  add(id: string, size: WidgetSize, opts: { multi?: boolean; funnel?: string } = {}) {
    const list = state.draft ?? []
    let placedId = id
    if (list.some((p) => p.id === id)) {
      if (!opts.multi) return
      let n = 2
      while (list.some((p) => p.id === `${id}:${n}`)) n++
      placedId = `${id}:${n}`
    }
    write([...list, { id: placedId, size, ...(opts.funnel ? { funnel: opts.funnel } : {}) }], placedId)
  },
  openGallery(open: boolean) { set({ galleryOpen: open }) },
  clearMoved() { if (state.moved) set({ moved: null }) },
}

/** The same layout as today's dashboard: saved as "no layout", so a later change to the default reaches the site. */
export function isDefaultLayout(list: Placed[]): boolean {
  return list.length === DEFAULT_LAYOUT.length && list.every((p, i) => {
    const d = DEFAULT_LAYOUT[i]
    return p.id === d.id && p.size === d.size && !p.view && !p.funnel
  })
}

/**
 * Whether a page draws the dashboard as widgets (`on`), and whether it knows yet (`ready`).
 *   * A member of a team in the beta: on; ready once the layout read has answered (a failed read draws the standard
 *     layout rather than nothing).
 *   * A member while /me is on its way, or of a team not in the beta: off, and ready at once, so today's frame draws
 *     without waiting (every reader gets the frame whatever /me says, 15-11-2026). A beta team may see today's frame
 *     for a moment on a cold load.
 *   * A share link and the demo: on only when the team has a saved layout (the read answers null until the team is in
 *     the beta); ready once the read has answered.
 */
export function widgetsMode({ isPublic, flag, answered, saved }: { isPublic: boolean; flag: boolean | null; answered: boolean; saved: Placed[] | null }): { on: boolean; ready: boolean } {
  if (isPublic) return { on: answered && saved != null, ready: answered }
  if (flag !== true) return { on: false, ready: true }
  return { on: true, ready: answered }
}

/**
 * The site's widgets, as this reader sees them.
 *   * A member of a team in the beta: the team's layout, or today's dashboard drawn as widgets when there is none.
 *   * A share link and the demo: the team's layout when the team is in the beta and has arranged one; otherwise
 *     `on` is false and the page keeps today's frame.
 *   * Everyone else: `on` is false.
 * `ready` is false while the layout is being read, so a page never draws one layout and then jumps to another.
 */
export function useDashboardWidgets(siteId: string) {
  const scope = useOptionalSiteScope()
  const isPublic = scope?.mode === 'public'
  const flag = useFeature(DASHBOARD_WIDGETS_FLAG)
  const canEdit = useCan('sites.edit')
  const enabled = isPublic || flag === true
  const read = useSiteSWR<Placed[] | null>(
    siteId, 'customer',
    (siteKey) => (enabled ? ['dashboardLayout', siteKey] : null),
    (ref) => getDashboardLayout(ref),
    { revalidateOnFocus: false, dedupingInterval: 60_000 },
  )
  const saved = read.data ?? null
  const { on, ready } = widgetsMode({ isPublic, flag, answered: read.data !== undefined || read.error != null, saved })
  const layout = saved ?? DEFAULT_LAYOUT

  /** Done: the draft becomes the team's layout. Customize closes only once the server has it. */
  const done = async () => {
    const draft = state.draft
    if (!draft) return set(IDLE)
    set({ saving: true, error: null })
    try {
      const next = isDefaultLayout(draft) ? (await resetDashboardLayout(siteId), null) : await saveDashboardLayout(siteId, draft)
      await read.mutate(next, { revalidate: false })
      set(IDLE)
    } catch {
      set({ saving: false, error: 'The layout could not be saved. Check your connection and press Done again.' })
    }
  }
  return { on, ready, layout, canCustomize: !isPublic && flag === true && canEdit === true, done, readError: read.error ?? null }
}
