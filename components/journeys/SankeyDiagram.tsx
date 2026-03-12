'use client'

import { useMemo } from 'react'
import { useTheme } from '@ciphera-net/ui'
import { TreeStructure } from '@phosphor-icons/react'
import { createTheme, ThemeProvider } from '@mui/material/styles'
import {
  SankeyDataProvider,
  SankeyLinkPlot,
  SankeyNodePlot,
  SankeyNodeLabelPlot,
  SankeyTooltip,
} from '@mui/x-charts-pro/SankeyChart'
import { ChartsWrapper } from '@mui/x-charts-pro/ChartsWrapper'
import { ChartsSurface } from '@mui/x-charts-pro/ChartsSurface'
import type { PathTransition } from '@/lib/api/journeys'

// ─── Types ──────────────────────────────────────────────────────────

interface SankeyDiagramProps {
  transitions: PathTransition[]
  totalSessions: number
  depth: number
  onNodeClick?: (path: string) => void
}

// ─── Data transformation ────────────────────────────────────────────

const NODE_COLOR = '#FD5E0F'
const EXIT_COLOR = '#595b63'

function transformToSankeyData(transitions: PathTransition[], depth: number) {
  const numColumns = depth + 1
  const nodeMap = new Map<string, { id: string; label: string; color: string }>()
  const links: { source: string; target: string; value: number }[] = []

  // Track flow in/out per node to compute exits
  const flowIn = new Map<string, number>()
  const flowOut = new Map<string, number>()

  for (const t of transitions) {
    if (t.step_index >= numColumns || t.step_index + 1 >= numColumns) continue

    const fromId = `${t.step_index}:${t.from_path}`
    const toId = `${t.step_index + 1}:${t.to_path}`

    if (!nodeMap.has(fromId)) {
      nodeMap.set(fromId, { id: fromId, label: t.from_path, color: NODE_COLOR })
    }
    if (!nodeMap.has(toId)) {
      nodeMap.set(toId, { id: toId, label: t.to_path, color: NODE_COLOR })
    }

    links.push({ source: fromId, target: toId, value: t.session_count })

    flowOut.set(fromId, (flowOut.get(fromId) ?? 0) + t.session_count)
    flowIn.set(toId, (flowIn.get(toId) ?? 0) + t.session_count)
  }

  // Add exit nodes for flows that don't continue
  for (const [nodeId, node] of nodeMap) {
    const totalIn = flowIn.get(nodeId) ?? 0
    const totalOut = flowOut.get(nodeId) ?? 0
    const flow = Math.max(totalIn, totalOut)
    const exitCount = flow - totalOut

    if (exitCount > 0) {
      const col = parseInt(nodeId.split(':')[0], 10)
      if (col < numColumns - 1) {
        const exitId = `${col + 1}:(exit)`
        if (!nodeMap.has(exitId)) {
          nodeMap.set(exitId, { id: exitId, label: '(exit)', color: EXIT_COLOR })
        }
        links.push({ source: nodeId, target: exitId, value: exitCount })
      }
    }
  }

  return {
    nodes: Array.from(nodeMap.values()),
    links,
  }
}

const valueFormatter = (value: number, context: { type: string }) => {
  if (context.type === 'link') {
    return `${value.toLocaleString()} sessions`
  }
  return `${value.toLocaleString()} sessions total`
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

  const muiTheme = useMemo(
    () =>
      createTheme({
        palette: { mode: isDark ? 'dark' : 'light' },
      }),
    [isDark],
  )

  const data = useMemo(
    () => transformToSankeyData(transitions, depth),
    [transitions, depth],
  )

  if (!transitions.length || !data.links.length) {
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

  return (
    <ThemeProvider theme={muiTheme}>
      <div style={{ width: '100%', height: 500 }}>
        <SankeyDataProvider
          series={[
            {
              type: 'sankey' as const,
              data,
              valueFormatter,
              nodeOptions: {
                sort: 'auto',
                padding: 20,
                width: 9,
                showLabels: true,
              },
              linkOptions: {
                color: 'source',
                opacity: 0.6,
                curveCorrection: 0,
              },
            },
          ]}
          margin={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <ChartsWrapper>
            <ChartsSurface>
              <SankeyNodePlot />
              <SankeyLinkPlot />
              <SankeyNodeLabelPlot />
            </ChartsSurface>
            <SankeyTooltip trigger="item" />
          </ChartsWrapper>
        </SankeyDataProvider>
      </div>
    </ThemeProvider>
  )
}
