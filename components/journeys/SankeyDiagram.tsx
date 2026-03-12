'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { useTheme } from '@ciphera-net/ui'
import { TreeStructure } from '@phosphor-icons/react'
import { sankey, sankeyJustify } from 'd3-sankey'
import type {
  SankeyNode as D3SankeyNode,
  SankeyLink as D3SankeyLink,
  SankeyExtraProperties,
} from 'd3-sankey'
import type { PathTransition } from '@/lib/api/journeys'

// ─── Types ──────────────────────────────────────────────────────────

interface SankeyDiagramProps {
  transitions: PathTransition[]
  totalSessions: number
  depth: number
  onNodeClick?: (path: string) => void
}

interface NodeExtra extends SankeyExtraProperties {
  id: string
  label: string
  color: string
}

interface LinkExtra extends SankeyExtraProperties {
  value: number
}

type LayoutNode = D3SankeyNode<NodeExtra, LinkExtra>
type LayoutLink = D3SankeyLink<NodeExtra, LinkExtra>

// ─── Constants ──────────────────────────────────────────────────────

const COLUMN_COLORS = [
  '#FD5E0F', // brand orange (entry)
  '#3B82F6', // blue
  '#10B981', // emerald
  '#F59E0B', // amber
  '#8B5CF6', // violet
  '#EC4899', // pink
  '#06B6D4', // cyan
  '#EF4444', // red
  '#84CC16', // lime
  '#F97316', // orange again
  '#6366F1', // indigo
]
const EXIT_GREY = '#52525b'
const SVG_W = 1100
const MARGIN = { top: 24, right: 140, bottom: 24, left: 10 }
const MAX_NODES_PER_COLUMN = 8

function colorForColumn(col: number): string {
  return COLUMN_COLORS[col % COLUMN_COLORS.length]
}

// ─── Smart label: show last meaningful path segment ─────────────────

function smartLabel(path: string): string {
  if (path === '/' || path === '(exit)') return path
  // Remove trailing slash, split, take last 2 segments
  const segments = path.replace(/\/$/, '').split('/')
  if (segments.length <= 2) return path
  // Show /last-segment for short paths, or …/last-segment for deep ones
  const last = segments[segments.length - 1]
  return `…/${last}`
}

function truncateLabel(s: string, max: number) {
  return s.length > max ? s.slice(0, max - 1) + '\u2026' : s
}

function estimateTextWidth(s: string) {
  return s.length * 7
}

// ─── Data transformation ────────────────────────────────────────────

function buildSankeyData(transitions: PathTransition[], depth: number) {
  const numCols = depth + 1
  const nodeMap = new Map<string, NodeExtra>()
  const links: Array<{ source: string; target: string; value: number }> = []
  const flowOut = new Map<string, number>()
  const flowIn = new Map<string, number>()

  for (const t of transitions) {
    if (t.step_index >= numCols || t.step_index + 1 >= numCols) continue

    const fromId = `${t.step_index}:${t.from_path}`
    const toId = `${t.step_index + 1}:${t.to_path}`

    if (!nodeMap.has(fromId)) {
      nodeMap.set(fromId, { id: fromId, label: t.from_path, color: colorForColumn(t.step_index) })
    }
    if (!nodeMap.has(toId)) {
      nodeMap.set(toId, { id: toId, label: t.to_path, color: colorForColumn(t.step_index + 1) })
    }

    links.push({ source: fromId, target: toId, value: t.session_count })
    flowOut.set(fromId, (flowOut.get(fromId) ?? 0) + t.session_count)
    flowIn.set(toId, (flowIn.get(toId) ?? 0) + t.session_count)
  }

  // ─── Cap nodes per column: keep top N by flow, merge rest into (other) ──
  const columns = new Map<number, string[]>()
  for (const [nodeId] of nodeMap) {
    if (nodeId === 'exit') continue
    const col = parseInt(nodeId.split(':')[0], 10)
    if (!columns.has(col)) columns.set(col, [])
    columns.get(col)!.push(nodeId)
  }

  for (const [col, nodeIds] of columns) {
    if (nodeIds.length <= MAX_NODES_PER_COLUMN) continue

    // Sort by total flow (max of in/out) descending
    nodeIds.sort((a, b) => {
      const flowA = Math.max(flowIn.get(a) ?? 0, flowOut.get(a) ?? 0)
      const flowB = Math.max(flowIn.get(b) ?? 0, flowOut.get(b) ?? 0)
      return flowB - flowA
    })

    const keep = new Set(nodeIds.slice(0, MAX_NODES_PER_COLUMN))
    const otherId = `${col}:(other)`
    nodeMap.set(otherId, { id: otherId, label: '(other)', color: colorForColumn(col) })

    // Redirect links from/to pruned nodes to (other)
    for (let i = 0; i < links.length; i++) {
      const l = links[i]
      if (!keep.has(l.source) && nodeIds.includes(l.source)) {
        links[i] = { ...l, source: otherId }
      }
      if (!keep.has(l.target) && nodeIds.includes(l.target)) {
        links[i] = { ...l, target: otherId }
      }
    }

    // Remove pruned nodes
    for (const id of nodeIds) {
      if (!keep.has(id)) nodeMap.delete(id)
    }
  }

  // Deduplicate links after merging (same source→target pairs)
  const linkMap = new Map<string, { source: string; target: string; value: number }>()
  for (const l of links) {
    const key = `${l.source}->${l.target}`
    const existing = linkMap.get(key)
    if (existing) {
      existing.value += l.value
    } else {
      linkMap.set(key, { ...l })
    }
  }

  // Recalculate flowOut/flowIn after merge
  flowOut.clear()
  flowIn.clear()
  for (const l of linkMap.values()) {
    flowOut.set(l.source, (flowOut.get(l.source) ?? 0) + l.value)
    flowIn.set(l.target, (flowIn.get(l.target) ?? 0) + l.value)
  }

  // Add exit nodes for flows that don't continue
  for (const [nodeId] of nodeMap) {
    if (nodeId === 'exit') continue
    const col = parseInt(nodeId.split(':')[0], 10)
    if (col >= numCols - 1) continue

    const totalIn = flowIn.get(nodeId) ?? 0
    const totalOut = flowOut.get(nodeId) ?? 0
    const flow = Math.max(totalIn, totalOut)
    const exitCount = flow - totalOut

    if (exitCount > 0) {
      const exitId = 'exit'
      if (!nodeMap.has(exitId)) {
        nodeMap.set(exitId, { id: exitId, label: '(exit)', color: EXIT_GREY })
      }
      const key = `${nodeId}->exit`
      const existing = linkMap.get(key)
      if (existing) {
        existing.value += exitCount
      } else {
        linkMap.set(key, { source: nodeId, target: exitId, value: exitCount })
      }
    }
  }

  return {
    nodes: Array.from(nodeMap.values()),
    links: Array.from(linkMap.values()),
  }
}

// ─── SVG path for a link ribbon ─────────────────────────────────────

function ribbonPath(link: LayoutLink): string {
  const src = link.source as LayoutNode
  const tgt = link.target as LayoutNode
  const sx = src.x1!
  const tx = tgt.x0!
  const w = link.width!
  // d3-sankey y0/y1 are the CENTER of the link band, not the top
  const sy = link.y0! - w / 2
  const ty = link.y1! - w / 2
  const mx = (sx + tx) / 2

  return [
    `M${sx},${sy}`,
    `C${mx},${sy} ${mx},${ty} ${tx},${ty}`,
    `L${tx},${ty + w}`,
    `C${mx},${ty + w} ${mx},${sy + w} ${sx},${sy + w}`,
    'Z',
  ].join(' ')
}

// ─── Component ──────────────────────────────────────────────────────

export default function SankeyDiagram({
  transitions,
  totalSessions,
  depth,
  onNodeClick,
}: SankeyDiagramProps) {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const [hovered, setHovered] = useState<{ type: 'link' | 'node'; id: string } | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const data = useMemo(
    () => buildSankeyData(transitions, depth),
    [transitions, depth],
  )

  // Dynamic SVG height based on max nodes in any column
  const svgH = useMemo(() => {
    const columns = new Map<number, number>()
    for (const node of data.nodes) {
      if (node.id === 'exit') continue
      const col = parseInt(node.id.split(':')[0], 10)
      columns.set(col, (columns.get(col) ?? 0) + 1)
    }
    const maxNodes = Math.max(1, ...columns.values())
    // Base 400 + 50px per node beyond 4
    return Math.max(400, Math.min(800, 400 + Math.max(0, maxNodes - 4) * 50))
  }, [data])

  const layout = useMemo(() => {
    if (!data.links.length) return null

    const generator = sankey<NodeExtra, LinkExtra>()
      .nodeId((d) => d.id)
      .nodeWidth(18)
      .nodePadding(16)
      .nodeAlign(sankeyJustify)
      .extent([
        [MARGIN.left, MARGIN.top],
        [SVG_W - MARGIN.right, svgH - MARGIN.bottom],
      ])

    return generator({
      nodes: data.nodes.map((d) => ({ ...d })),
      links: data.links.map((d) => ({ ...d })),
    })
  }, [data, svgH])

  // Single event handler on SVG — reads data-* attrs from e.target
  const handleMouseOver = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const target = e.target as SVGElement
    const el = target.closest('[data-node-id], [data-link-id]') as SVGElement | null
    if (!el) return
    const nodeId = el.getAttribute('data-node-id')
    const linkId = el.getAttribute('data-link-id')
    if (nodeId) {
      setHovered((prev) => (prev?.type === 'node' && prev.id === nodeId) ? prev : { type: 'node', id: nodeId })
    } else if (linkId) {
      setHovered((prev) => (prev?.type === 'link' && prev.id === linkId) ? prev : { type: 'link', id: linkId })
    }
  }, [])

  const handleMouseLeave = useCallback(() => {
    setHovered(null)
  }, [])

  // ─── Empty state ────────────────────────────────────────────────
  if (!transitions.length || !layout) {
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

  // ─── Colors ─────────────────────────────────────────────────────
  const labelColor = isDark ? '#e5e5e5' : '#404040'
  const labelBg = isDark ? 'rgba(23, 23, 23, 0.9)' : 'rgba(255, 255, 255, 0.9)'
  const nodeStroke = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)'

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${SVG_W} ${svgH}`}
      preserveAspectRatio="xMidYMid meet"
      className="w-full"
      role="img"
      aria-label="User journey Sankey diagram"
      onMouseMove={handleMouseOver}
      onMouseLeave={handleMouseLeave}
    >
      {/* Links */}
      <g>
        {layout.links.map((link, i) => {
          const src = link.source as LayoutNode
          const tgt = link.target as LayoutNode
          const srcId = String(src.id)
          const tgtId = String(tgt.id)
          const linkId = `${srcId}->${tgtId}`

          let isHighlighted = false
          if (hovered?.type === 'link') {
            isHighlighted = hovered.id === linkId
          } else if (hovered?.type === 'node') {
            isHighlighted = srcId === hovered.id || tgtId === hovered.id
          }

          let opacity = isDark ? 0.45 : 0.5
          if (hovered) {
            opacity = isHighlighted ? 0.75 : 0.08
          }

          return (
            <path
              key={i}
              d={ribbonPath(link)}
              fill={src.color}
              opacity={opacity}
              style={{ transition: 'opacity 0.15s ease' }}
              data-link-id={linkId}
            >
              <title>
                {src.label} → {tgt.label}:{' '}
                {(link.value as number).toLocaleString()} sessions
              </title>
            </path>
          )
        })}
      </g>

      {/* Nodes */}
      <g>
        {layout.nodes.map((node) => {
          const nodeId = String(node.id)
          const isExit = nodeId === 'exit'
          const w = isExit ? 8 : (node.x1 ?? 0) - (node.x0 ?? 0)
          const h = (node.y1 ?? 0) - (node.y0 ?? 0)
          const x = isExit ? (node.x0 ?? 0) + 5 : (node.x0 ?? 0)

          return (
            <rect
              key={nodeId}
              x={x}
              y={node.y0}
              width={w}
              height={h}
              fill={node.color}
              stroke={nodeStroke}
              strokeWidth={1}
              rx={2}
              className={
                onNodeClick && !isExit ? 'cursor-pointer' : 'cursor-default'
              }
              data-node-id={nodeId}
              onClick={() => {
                if (onNodeClick && !isExit) onNodeClick(node.label)
              }}
            >
              <title>
                {node.label} — {(node.value ?? 0).toLocaleString()} sessions
              </title>
            </rect>
          )
        })}
      </g>

      {/* Labels — only for nodes tall enough to avoid overlap */}
      <g>
        {layout.nodes.map((node) => {
          const x0 = node.x0 ?? 0
          const x1 = node.x1 ?? 0
          const y0 = node.y0 ?? 0
          const y1 = node.y1 ?? 0
          const nodeH = y1 - y0
          if (nodeH < 22) return null // hide labels for tiny nodes

          const rawLabel = smartLabel(node.label)
          const label = truncateLabel(rawLabel, 24)
          const textW = estimateTextWidth(label)
          const padX = 6
          const rectW = textW + padX * 2
          const rectH = 20

          const isRight = x1 > SVG_W - MARGIN.right - 60
          const textX = isRight ? x0 - 6 : x1 + 6
          const textY = y0 + nodeH / 2
          const anchor = isRight ? 'end' : 'start'
          const bgX = isRight ? textX - textW - padX : textX - padX
          const bgY = textY - rectH / 2

          const nodeId = String(node.id)
          const isExit = nodeId === 'exit'

          return (
            <g key={`label-${nodeId}`} data-node-id={nodeId}>
              <rect
                x={bgX}
                y={bgY}
                width={rectW}
                height={rectH}
                rx={3}
                fill={labelBg}
              />
              <text
                x={textX}
                y={textY}
                dy="0.35em"
                textAnchor={anchor}
                fill={labelColor}
                fontSize={12}
                fontFamily="system-ui, -apple-system, sans-serif"
                className={
                  onNodeClick && !isExit ? 'cursor-pointer' : 'cursor-default'
                }
                onClick={() => {
                  if (onNodeClick && !isExit) onNodeClick(node.label)
                }}
              >
                {label}
              </text>
            </g>
          )
        })}
      </g>
    </svg>
  )
}
