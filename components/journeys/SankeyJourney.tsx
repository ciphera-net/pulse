'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ResponsiveSankey } from '@nivo/sankey'
import { TreeStructure, X } from '@phosphor-icons/react'
import type { PathTransition } from '@/lib/api/journeys'

// ─── Types ──────────────────────────────────────────────────────────

interface SankeyJourneyProps {
  transitions: PathTransition[]
  totalSessions: number
  depth: number
}

interface SankeyNode {
  id: string
  stepIndex: number
}

interface SankeyLink {
  source: string
  target: string
  value: number
}

interface SankeyData {
  nodes: SankeyNode[]
  links: SankeyLink[]
}

// ─── Constants ──────────────────────────────────────────────────────

const COLUMN_COLORS = [
  '#FD5E0F', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6',
  '#EC4899', '#06B6D4', '#EF4444', '#84CC16', '#F97316', '#6366F1',
]

const MAX_NODES_PER_STEP = 15

// ─── Helpers ────────────────────────────────────────────────────────

function smartLabel(path: string): string {
  if (path === '/' || path === '(other)') return path
  const segments = path.replace(/\/$/, '').split('/')
  if (segments.length <= 2) return path
  return `.../${segments[segments.length - 1]}`
}

/** Extract the original path from a step-prefixed node id like "0:/blog" */
function pathFromId(id: string): string {
  const idx = id.indexOf(':')
  return idx >= 0 ? id.slice(idx + 1) : id
}

/** Extract the step index from a step-prefixed node id */
function stepFromId(id: string): number {
  const idx = id.indexOf(':')
  return idx >= 0 ? parseInt(id.slice(0, idx), 10) : 0
}

// ─── Data Transformation ────────────────────────────────────────────

function buildSankeyData(
  transitions: PathTransition[],
  filterPath?: string,
): SankeyData {
  if (transitions.length === 0) return { nodes: [], links: [] }

  // Group transitions by step and count sessions per path at each step
  const stepPaths = new Map<number, Map<string, number>>()

  for (const t of transitions) {
    // from_path at step_index
    if (!stepPaths.has(t.step_index)) stepPaths.set(t.step_index, new Map())
    const fromMap = stepPaths.get(t.step_index)!
    fromMap.set(t.from_path, (fromMap.get(t.from_path) ?? 0) + t.session_count)

    // to_path at step_index + 1
    const nextStep = t.step_index + 1
    if (!stepPaths.has(nextStep)) stepPaths.set(nextStep, new Map())
    const toMap = stepPaths.get(nextStep)!
    toMap.set(t.to_path, (toMap.get(t.to_path) ?? 0) + t.session_count)
  }

  // For each step, keep top N paths, group rest into (other)
  const topPathsPerStep = new Map<number, Set<string>>()
  for (const [step, pathMap] of stepPaths) {
    const sorted = Array.from(pathMap.entries()).sort((a, b) => b[1] - a[1])
    const kept = new Set(sorted.slice(0, MAX_NODES_PER_STEP).map(([p]) => p))
    topPathsPerStep.set(step, kept)
  }

  // Build links with capping
  const linkMap = new Map<string, number>()
  for (const t of transitions) {
    const fromStep = t.step_index
    const toStep = t.step_index + 1
    const fromTop = topPathsPerStep.get(fromStep)!
    const toTop = topPathsPerStep.get(toStep)!

    const fromPath = fromTop.has(t.from_path) ? t.from_path : '(other)'
    const toPath = toTop.has(t.to_path) ? t.to_path : '(other)'

    // Skip self-links where both collapse to (other)
    if (fromPath === '(other)' && toPath === '(other)') continue

    const sourceId = `${fromStep}:${fromPath}`
    const targetId = `${toStep}:${toPath}`
    const key = `${sourceId}|${targetId}`
    linkMap.set(key, (linkMap.get(key) ?? 0) + t.session_count)
  }

  let links: SankeyLink[] = Array.from(linkMap.entries()).map(([key, value]) => {
    const [source, target] = key.split('|')
    return { source, target, value }
  })

  // Collect all node ids referenced by links
  const nodeIdSet = new Set<string>()
  for (const link of links) {
    nodeIdSet.add(link.source)
    nodeIdSet.add(link.target)
  }

  let nodes: SankeyNode[] = Array.from(nodeIdSet).map((id) => ({
    id,
    stepIndex: stepFromId(id),
  }))

  // ─── Filter by path (BFS forward + backward) ────────────────────
  if (filterPath) {
    const matchingNodeIds = nodes
      .filter((n) => pathFromId(n.id) === filterPath)
      .map((n) => n.id)

    if (matchingNodeIds.length === 0) return { nodes: [], links: [] }

    // Build adjacency
    const forwardAdj = new Map<string, Set<string>>()
    const backwardAdj = new Map<string, Set<string>>()
    for (const link of links) {
      if (!forwardAdj.has(link.source)) forwardAdj.set(link.source, new Set())
      forwardAdj.get(link.source)!.add(link.target)
      if (!backwardAdj.has(link.target)) backwardAdj.set(link.target, new Set())
      backwardAdj.get(link.target)!.add(link.source)
    }

    const reachable = new Set<string>(matchingNodeIds)

    // BFS forward
    let queue = [...matchingNodeIds]
    while (queue.length > 0) {
      const next: string[] = []
      for (const nodeId of queue) {
        for (const neighbor of forwardAdj.get(nodeId) ?? []) {
          if (!reachable.has(neighbor)) {
            reachable.add(neighbor)
            next.push(neighbor)
          }
        }
      }
      queue = next
    }

    // BFS backward
    queue = [...matchingNodeIds]
    while (queue.length > 0) {
      const next: string[] = []
      for (const nodeId of queue) {
        for (const neighbor of backwardAdj.get(nodeId) ?? []) {
          if (!reachable.has(neighbor)) {
            reachable.add(neighbor)
            next.push(neighbor)
          }
        }
      }
      queue = next
    }

    links = links.filter(
      (l) => reachable.has(l.source) && reachable.has(l.target),
    )

    const filteredNodeIds = new Set<string>()
    for (const link of links) {
      filteredNodeIds.add(link.source)
      filteredNodeIds.add(link.target)
    }
    nodes = nodes.filter((n) => filteredNodeIds.has(n.id))
  }

  return { nodes, links }
}

// ─── Component ──────────────────────────────────────────────────────

export default function SankeyJourney({
  transitions,
  totalSessions,
  depth,
}: SankeyJourneyProps) {
  const [filterPath, setFilterPath] = useState<string | null>(null)
  const [isDark, setIsDark] = useState(false)

  // Reactively detect dark mode via MutationObserver
  useEffect(() => {
    const el = document.documentElement
    setIsDark(el.classList.contains('dark'))

    const observer = new MutationObserver(() => {
      setIsDark(el.classList.contains('dark'))
    })
    observer.observe(el, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  const data = useMemo(
    () => buildSankeyData(transitions, filterPath ?? undefined),
    [transitions, filterPath],
  )

  const handleClick = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (item: any) => {
      if (!item.id || typeof item.id !== 'string') return // link click, ignore
      const path = pathFromId(item.id)
      if (path === '(other)') return
      setFilterPath((prev) => (prev === path ? null : path))
    },
    [],
  )

  // Clear filter when data changes
  const transitionsKey = transitions.length + '-' + depth
  const [prevKey, setPrevKey] = useState(transitionsKey)
  if (prevKey !== transitionsKey) {
    setPrevKey(transitionsKey)
    if (filterPath !== null) setFilterPath(null)
  }

  // ─── Empty state ────────────────────────────────────────────────
  if (!transitions.length || data.nodes.length === 0) {
    return (
      <div className="h-[400px] flex flex-col items-center justify-center text-center px-6 py-8 gap-3">
        <div className="rounded-full bg-neutral-100 dark:bg-neutral-800 p-4">
          <TreeStructure className="w-8 h-8 text-neutral-500 dark:text-neutral-400" />
        </div>
        <h4 className="font-semibold text-neutral-900 dark:text-white">
          No journey data yet
        </h4>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 max-w-xs">
          Navigation flows will appear here as visitors browse through your site.
        </p>
      </div>
    )
  }

  const labelColor = isDark ? '#a3a3a3' : '#525252'

  return (
    <div>
      {/* Filter reset bar */}
      {filterPath && (
        <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg bg-brand-orange/10 dark:bg-brand-orange/10 text-sm">
          <span className="text-neutral-700 dark:text-neutral-300">
            Showing flows through{' '}
            <span className="font-medium text-neutral-900 dark:text-white">
              {filterPath}
            </span>
          </span>
          <button
            type="button"
            onClick={() => setFilterPath(null)}
            className="ml-auto flex items-center gap-1 text-xs font-medium text-brand-orange hover:text-brand-orange/80 transition-colors"
          >
            <X weight="bold" className="w-3.5 h-3.5" />
            Reset
          </button>
        </div>
      )}

      <div style={{ height: Math.max(400, Math.min(700, data.nodes.length * 28)) }}>
        <ResponsiveSankey<SankeyNode, SankeyLink>
          data={data}
          margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
          align="justify"
          sort="descending"
          colors={(node) =>
            COLUMN_COLORS[node.stepIndex % COLUMN_COLORS.length]
          }
          nodeThickness={12}
          nodeSpacing={20}
          nodeInnerPadding={0}
          nodeBorderWidth={0}
          nodeBorderRadius={3}
          nodeOpacity={1}
          nodeHoverOpacity={1}
          nodeHoverOthersOpacity={0.3}
          linkOpacity={0.2}
          linkHoverOpacity={0.5}
          linkHoverOthersOpacity={0.05}
          linkContract={2}
          enableLinkGradient
          enableLabels={false}
          isInteractive
          onClick={handleClick}
          nodeTooltip={({ node }) => (
            <div className="rounded-lg px-3 py-2 text-sm shadow-lg bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700">
              <div className="font-medium text-neutral-900 dark:text-white">
                {pathFromId(node.id)}
              </div>
              <div className="text-neutral-500 dark:text-neutral-400 text-xs mt-0.5">
                Step {node.stepIndex + 1} &middot;{' '}
                {node.value.toLocaleString()} sessions
              </div>
            </div>
          )}
          linkTooltip={({ link }) => (
            <div className="rounded-lg px-3 py-2 text-sm shadow-lg bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700">
              <div className="font-medium text-neutral-900 dark:text-white">
                {pathFromId(link.source.id)} &rarr;{' '}
                {pathFromId(link.target.id)}
              </div>
              <div className="text-neutral-500 dark:text-neutral-400 text-xs mt-0.5">
                {link.value.toLocaleString()} sessions
              </div>
            </div>
          )}
          theme={{
            tooltip: {
              container: {
                background: 'transparent',
                boxShadow: 'none',
                padding: 0,
              },
            },
          }}
        />
      </div>
    </div>
  )
}
