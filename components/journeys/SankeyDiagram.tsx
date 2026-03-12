'use client'

import { useMemo, useState } from 'react'
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

// Multi-hue palette — distinct colors per column for visual separation
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
const SVG_H = 540
const MARGIN = { top: 30, right: 140, bottom: 30, left: 10 }

function colorForColumn(col: number): string {
  return COLUMN_COLORS[col % COLUMN_COLORS.length]
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

  // Add exit nodes for flows that don't continue to the next step
  for (const [nodeId] of nodeMap) {
    const col = parseInt(nodeId.split(':')[0], 10)
    if (col >= numCols - 1) continue // last column — all exit implicitly

    const totalIn = flowIn.get(nodeId) ?? 0
    const totalOut = flowOut.get(nodeId) ?? 0
    const flow = Math.max(totalIn, totalOut)
    const exitCount = flow - totalOut

    if (exitCount > 0) {
      const exitId = `exit-${col + 1}`
      if (!nodeMap.has(exitId)) {
        nodeMap.set(exitId, { id: exitId, label: '(exit)', color: EXIT_GREY })
      }
      links.push({ source: nodeId, target: exitId, value: exitCount })
    }
  }

  return {
    nodes: Array.from(nodeMap.values()),
    links,
  }
}

// ─── SVG path for a link ribbon ─────────────────────────────────────

function ribbonPath(link: LayoutLink): string {
  const src = link.source as LayoutNode
  const tgt = link.target as LayoutNode
  const sx = src.x1!
  const tx = tgt.x0!
  const sy = link.y0!
  const ty = link.y1!
  const w = link.width!
  const mx = (sx + tx) / 2

  return [
    `M${sx},${sy}`,
    `C${mx},${sy} ${mx},${ty} ${tx},${ty}`,
    `L${tx},${ty + w}`,
    `C${mx},${ty + w} ${mx},${sy + w} ${sx},${sy + w}`,
    'Z',
  ].join(' ')
}

// ─── Label helpers ──────────────────────────────────────────────────

function truncateLabel(s: string, max: number) {
  return s.length > max ? s.slice(0, max - 1) + '\u2026' : s
}

// Approximate text width at 12px system font (~7px per char)
function estimateTextWidth(s: string) {
  return s.length * 7
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
  const [hoveredLink, setHoveredLink] = useState<string | null>(null)
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)
  const hasHover = hoveredLink !== null || hoveredNode !== null

  const data = useMemo(
    () => buildSankeyData(transitions, depth),
    [transitions, depth],
  )

  const layout = useMemo(() => {
    if (!data.links.length) return null

    const generator = sankey<NodeExtra, LinkExtra>()
      .nodeId((d) => d.id)
      .nodeWidth(18)
      .nodePadding(32)
      .nodeAlign(sankeyJustify)
      .extent([
        [MARGIN.left, MARGIN.top],
        [SVG_W - MARGIN.right, SVG_H - MARGIN.bottom],
      ])

    return generator({
      nodes: data.nodes.map((d) => ({ ...d })),
      links: data.links.map((d) => ({ ...d })),
    })
  }, [data])

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
      viewBox={`0 0 ${SVG_W} ${SVG_H}`}
      preserveAspectRatio="xMidYMid meet"
      className="w-full"
      role="img"
      aria-label="User journey Sankey diagram"
    >
      {/* Links */}
      <g>
        {layout.links.map((link, i) => {
          const src = link.source as LayoutNode
          const tgt = link.target as LayoutNode
          const linkId = `${src.id}->${tgt.id}`
          const isLinkHovered = hoveredLink === linkId
          const srcId = String(src.id)
          const tgtId = String(tgt.id)
          const isConnectedToNode =
            hoveredNode !== null &&
            (srcId === hoveredNode || tgtId === hoveredNode)
          const isHighlighted = isLinkHovered || isConnectedToNode

          const linkColor = src.color

          let opacity = isDark ? 0.45 : 0.5
          if (isHighlighted) opacity = 0.75
          else if (hasHover) opacity = 0.08

          return (
            <path
              key={i}
              d={ribbonPath(link)}
              fill={linkColor}
              opacity={opacity}
              style={{ transition: 'opacity 0.15s ease' }}
              onMouseEnter={() => setHoveredLink(linkId)}
              onMouseLeave={() => setHoveredLink(null)}
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
          const isExit = nodeId.startsWith('exit-')
          const w = (node.x1 ?? 0) - (node.x0 ?? 0)
          const h = (node.y1 ?? 0) - (node.y0 ?? 0)

          return (
            <rect
              key={nodeId}
              x={node.x0}
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
              onMouseEnter={() => setHoveredNode(nodeId)}
              onMouseLeave={() => setHoveredNode(null)}
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

      {/* Labels with background */}
      <g>
        {layout.nodes.map((node) => {
          const x0 = node.x0 ?? 0
          const x1 = node.x1 ?? 0
          const y0 = node.y0 ?? 0
          const y1 = node.y1 ?? 0
          const nodeH = y1 - y0
          if (nodeH < 14) return null

          const label = truncateLabel(node.label, 28)
          const textW = estimateTextWidth(label)
          const padX = 6
          const padY = 3
          const rectW = textW + padX * 2
          const rectH = 20

          // Labels go right of node; last-column labels go left
          const isRight = x1 > SVG_W - MARGIN.right - 60
          const textX = isRight ? x0 - 6 : x1 + 6
          const textY = y0 + nodeH / 2
          const anchor = isRight ? 'end' : 'start'
          const bgX = isRight ? textX - textW - padX : textX - padX
          const bgY = textY - rectH / 2

          const nodeId = String(node.id)
          const isExit = nodeId.startsWith('exit-')

          return (
            <g
              key={`label-${nodeId}`}
              onMouseEnter={() => setHoveredNode(nodeId)}
              onMouseLeave={() => setHoveredNode(null)}
            >
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
