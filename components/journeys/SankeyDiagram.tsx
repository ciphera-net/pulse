'use client'

import { useMemo, useState } from 'react'
import { useTheme } from '@ciphera-net/ui'
import { TreeStructure } from '@phosphor-icons/react'
import type { PathTransition } from '@/lib/api/journeys'

// ─── Types ──────────────────────────────────────────────────────────

interface SankeyDiagramProps {
  transitions: PathTransition[]
  totalSessions: number
  depth: number
  onNodeClick?: (path: string) => void
}

interface PositionedNode {
  id: string       // "col:path"
  path: string
  column: number
  flow: number
  x: number
  y: number
  height: number
}

interface PositionedLink {
  id: string
  fromNode: PositionedNode
  toNode: PositionedNode
  sessionCount: number
  sourceY: number
  targetY: number
  width: number
}

// ─── Layout constants ───────────────────────────────────────────────

const PADDING_X = 60
const PADDING_Y = 40
const NODE_WIDTH = 12
const NODE_GAP = 4
const MIN_NODE_HEIGHT = 4
const LABEL_MAX_LENGTH = 24
const EXIT_LABEL = '(exit)'

// ─── Helpers ────────────────────────────────────────────────────────

function truncatePath(path: string, maxLen: number): string {
  if (path.length <= maxLen) return path
  return path.slice(0, maxLen - 1) + '\u2026'
}

function buildSankeyLayout(
  transitions: PathTransition[],
  depth: number,
  svgWidth: number,
  svgHeight: number,
) {
  if (!transitions.length) return { nodes: [], links: [] }

  // ── 1. Build columns ──────────────────────────────────────────────
  // columns[colIndex] = Map<path, { inFlow, outFlow }>
  const numColumns = depth + 1
  const columns: Map<string, { inFlow: number; outFlow: number }>[] = Array.from(
    { length: numColumns },
    () => new Map(),
  )

  for (const t of transitions) {
    const fromCol = t.step_index
    const toCol = t.step_index + 1
    if (fromCol >= numColumns || toCol >= numColumns) continue

    // from node
    const fromEntry = columns[fromCol].get(t.from_path) ?? { inFlow: 0, outFlow: 0 }
    fromEntry.outFlow += t.session_count
    columns[fromCol].set(t.from_path, fromEntry)

    // to node
    const toEntry = columns[toCol].get(t.to_path) ?? { inFlow: 0, outFlow: 0 }
    toEntry.inFlow += t.session_count
    columns[toCol].set(t.to_path, toEntry)
  }

  // For column 0, nodes that have no inFlow — use outFlow as total flow
  // For other columns, use max(inFlow, outFlow)
  // Also ensure column 0 nodes get their inFlow from the fact they are entry points

  // ── 2. Add exit nodes ─────────────────────────────────────────────
  // For each node, exitCount = inFlow - outFlow (if positive)
  // For column 0, exitCount = outFlow - outFlow = handled differently:
  //   column 0 nodes: flow = outFlow, and if they also appear as to_path, inFlow is set
  //   Actually for column 0 the total flow IS outFlow (they are entry points)

  // Build exit transitions for each column (except last, which is all exit)
  const exitTransitions: { fromCol: number; fromPath: string; exitCount: number }[] = []
  for (let col = 0; col < numColumns; col++) {
    for (const [path, entry] of columns[col]) {
      const totalFlow = col === 0 ? entry.outFlow : Math.max(entry.inFlow, entry.outFlow)
      const exitCount = totalFlow - entry.outFlow
      if (exitCount > 0) {
        exitTransitions.push({ fromCol: col, fromPath: path, exitCount })
      }
    }
  }

  // For the last column, ALL flow is exit (no outgoing transitions)
  // We don't add extra exit nodes for the last column since those nodes are already endpoints

  // Add exit nodes to columns (they sit in the same column, below the real nodes,
  // or we add them as virtual nodes in col+1). Actually per spec: "Add virtual (exit) nodes
  // at the right end of flows that don't continue" — this means we add them as targets in
  // the next column. But we only do this for non-last columns.
  const exitLinks: { fromCol: number; fromPath: string; exitCount: number }[] = []
  for (const et of exitTransitions) {
    if (et.fromCol < numColumns - 1) {
      const exitCol = et.fromCol + 1
      const exitEntry = columns[exitCol].get(EXIT_LABEL) ?? { inFlow: 0, outFlow: 0 }
      exitEntry.inFlow += et.exitCount
      columns[exitCol].set(EXIT_LABEL, exitEntry)
      exitLinks.push(et)
    }
  }

  // ── 3. Sort nodes per column and assign positions ─────────────────
  const availableWidth = svgWidth - PADDING_X * 2
  const availableHeight = svgHeight - PADDING_Y * 2
  const colSpacing = numColumns > 1 ? availableWidth / (numColumns - 1) : 0

  const positionedNodes: Map<string, PositionedNode> = new Map()

  for (let col = 0; col < numColumns; col++) {
    const entries = Array.from(columns[col].entries()).map(([path, entry]) => ({
      path,
      flow: col === 0 ? entry.outFlow : Math.max(entry.inFlow, entry.outFlow),
    }))

    // Sort by flow descending, but keep (exit) at bottom
    entries.sort((a, b) => {
      if (a.path === EXIT_LABEL) return 1
      if (b.path === EXIT_LABEL) return -1
      return b.flow - a.flow
    })

    const totalFlow = entries.reduce((sum, e) => sum + e.flow, 0)
    const totalGaps = Math.max(0, entries.length - 1) * NODE_GAP
    const usableHeight = availableHeight - totalGaps

    let y = PADDING_Y
    const x = PADDING_X + col * colSpacing

    for (const entry of entries) {
      const proportion = totalFlow > 0 ? entry.flow / totalFlow : 1 / entries.length
      const nodeHeight = Math.max(MIN_NODE_HEIGHT, proportion * usableHeight)
      const id = `${col}:${entry.path}`

      positionedNodes.set(id, {
        id,
        path: entry.path,
        column: col,
        flow: entry.flow,
        x,
        y,
        height: nodeHeight,
      })

      y += nodeHeight + NODE_GAP
    }
  }

  // ── 4. Build positioned links ─────────────────────────────────────
  // Track how much vertical space has been used at each node's source/target side
  const sourceOffsets: Map<string, number> = new Map()
  const targetOffsets: Map<string, number> = new Map()

  const allLinks: {
    fromId: string
    toId: string
    sessionCount: number
  }[] = []

  // Regular transitions
  for (const t of transitions) {
    const fromCol = t.step_index
    const toCol = t.step_index + 1
    if (fromCol >= numColumns || toCol >= numColumns) continue
    allLinks.push({
      fromId: `${fromCol}:${t.from_path}`,
      toId: `${toCol}:${t.to_path}`,
      sessionCount: t.session_count,
    })
  }

  // Exit links
  for (const et of exitLinks) {
    allLinks.push({
      fromId: `${et.fromCol}:${et.fromPath}`,
      toId: `${et.fromCol + 1}:${EXIT_LABEL}`,
      sessionCount: et.exitCount,
    })
  }

  // Sort links by session count descending for better visual stacking
  allLinks.sort((a, b) => b.sessionCount - a.sessionCount)

  const positionedLinks: PositionedLink[] = []

  for (const link of allLinks) {
    const fromNode = positionedNodes.get(link.fromId)
    const toNode = positionedNodes.get(link.toId)
    if (!fromNode || !toNode) continue

    const linkWidth = Math.max(
      1,
      fromNode.flow > 0 ? (link.sessionCount / fromNode.flow) * fromNode.height : 1,
    )

    const sourceOffset = sourceOffsets.get(link.fromId) ?? 0
    const targetOffset = targetOffsets.get(link.toId) ?? 0

    positionedLinks.push({
      id: `${link.fromId}->${link.toId}`,
      fromNode,
      toNode,
      sessionCount: link.sessionCount,
      sourceY: fromNode.y + sourceOffset,
      targetY: toNode.y + targetOffset,
      width: linkWidth,
    })

    sourceOffsets.set(link.fromId, sourceOffset + linkWidth)
    targetOffsets.set(link.toId, targetOffset + linkWidth)
  }

  return {
    nodes: Array.from(positionedNodes.values()),
    links: positionedLinks,
  }
}

function buildLinkPath(link: PositionedLink): string {
  const sx = link.fromNode.x + NODE_WIDTH
  const sy = link.sourceY
  const tx = link.toNode.x
  const ty = link.targetY
  const w = link.width
  const midX = (sx + tx) / 2

  return [
    `M ${sx},${sy}`,
    `C ${midX},${sy} ${midX},${ty} ${tx},${ty}`,
    `L ${tx},${ty + w}`,
    `C ${midX},${ty + w} ${midX},${sy + w} ${sx},${sy + w}`,
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
  const [hoveredLink, setHoveredLink] = useState<string | null>(null)

  const svgWidth = 1000
  const svgHeight = 500

  const { nodes, links } = useMemo(
    () => buildSankeyLayout(transitions, depth, svgWidth, svgHeight),
    [transitions, depth],
  )

  if (!transitions.length || !links.length) {
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

  const numColumns = depth + 1
  const isLastColumn = (col: number) => col === numColumns - 1

  // Colors — brand orange nodes with column-based fade
  const brandOrange = '#FD5E0F'
  const labelFill = isDark ? '#d4d4d4' : '#525252'
  const linkDefault = isDark ? 'rgba(253, 94, 15, 0.15)' : 'rgba(253, 94, 15, 0.12)'
  const linkHover = isDark ? 'rgba(253, 94, 15, 0.45)' : 'rgba(253, 94, 15, 0.35)'
  const linkDimmed = isDark ? 'rgba(253, 94, 15, 0.04)' : 'rgba(253, 94, 15, 0.05)'
  const exitNodeFill = isDark ? '#404040' : '#d4d4d4'

  // Fade node opacity from 1.0 (entry) to 0.45 (deepest)
  const nodeOpacity = (col: number) => {
    if (numColumns <= 1) return 1
    return 1 - (col / (numColumns - 1)) * 0.55
  }

  return (
    <svg
      viewBox={`0 0 ${svgWidth} ${svgHeight}`}
      preserveAspectRatio="xMidYMid meet"
      className="w-full"
      role="img"
      aria-label="User journey Sankey diagram"
    >
      {/* Links */}
      <g>
        {links.map((link) => {
          const isHovered = hoveredLink === link.id
          const hasSomeHovered = hoveredLink !== null
          const pct = totalSessions > 0
            ? ((link.sessionCount / totalSessions) * 100).toFixed(1)
            : '0'

          let fill: string
          if (isHovered) fill = linkHover
          else if (hasSomeHovered) fill = linkDimmed
          else fill = linkDefault

          return (
            <path
              key={link.id}
              d={buildLinkPath(link)}
              fill={fill}
              style={{ transition: 'fill 0.15s ease' }}
              onMouseEnter={() => setHoveredLink(link.id)}
              onMouseLeave={() => setHoveredLink(null)}
              className="cursor-default"
            >
              <title>
                {link.fromNode.path} → {link.toNode.path}: {link.sessionCount.toLocaleString()} sessions ({pct}%)
              </title>
            </path>
          )
        })}
      </g>

      {/* Nodes */}
      <g>
        {nodes.map((node) => {
          const isExit = node.path === EXIT_LABEL

          return (
            <rect
              key={node.id}
              x={node.x}
              y={node.y}
              width={NODE_WIDTH}
              height={node.height}
              rx={3}
              ry={3}
              fill={isExit ? exitNodeFill : brandOrange}
              opacity={isExit ? 0.4 : nodeOpacity(node.column)}
              className={onNodeClick && !isExit ? 'cursor-pointer' : 'cursor-default'}
              onClick={() => {
                if (onNodeClick && !isExit) onNodeClick(node.path)
              }}
            >
              <title>{node.path} — {node.flow.toLocaleString()} sessions</title>
            </rect>
          )
        })}
      </g>

      {/* Labels */}
      <g>
        {nodes.map((node) => {
          const isLast = isLastColumn(node.column)
          const labelX = isLast ? node.x - 6 : node.x + NODE_WIDTH + 6
          const labelY = node.y + node.height / 2
          const anchor = isLast ? 'end' : 'start'
          const displayLabel = truncatePath(node.path, LABEL_MAX_LENGTH)

          // Only show labels for nodes tall enough to fit text
          if (node.height < 10) return null

          return (
            <text
              key={`label-${node.id}`}
              x={labelX}
              y={labelY}
              dy="0.35em"
              textAnchor={anchor}
              fill={labelFill}
              fontSize={11}
              className={onNodeClick && node.path !== EXIT_LABEL ? 'cursor-pointer' : 'cursor-default'}
              onClick={() => {
                if (onNodeClick && node.path !== EXIT_LABEL) onNodeClick(node.path)
              }}
            >
              {displayLabel}
              <title>{node.path}</title>
            </text>
          )
        })}
      </g>
    </svg>
  )
}
