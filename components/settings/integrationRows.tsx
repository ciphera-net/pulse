'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { TIMING } from '@/lib/motion'
import { PanelRow, PanelRows } from '@/components/settings/panels'
import { cn } from '@/lib/utils'

// ─── The rows a "connect another tool" settings tab is made of ──────────────
//
// Extracted from SiteIntegrationsTab (PULSE-118, M11) so the Import tab is
// built from the SAME parts rather than a second copy that drifts: a logo tile,
// the header row every service opens with, the detail rows under it, and the
// reveal an inline setup form opens with. Integrations renders exactly what it
// rendered before the move; the classes below are its classes, unchanged.

/**
 * LogoTile: the 40px brand tile a service row leads with.
 *
 * Integrations desaturates it (`grayscale opacity-60`) until the service is
 * connected, so the tile says "not connected" without a word. The Import tab
 * passes `colorize` always: a source there is a tool the customer already
 * uses, and its logo is how they find it (Q-M11, owner 27-09-2026: "on the
 * settings screen, use the colored logos").
 */
export function LogoTile({ colorize, children }: { colorize: boolean; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'flex h-10 w-10 shrink-0 items-center justify-center rounded-none bg-accent transition-[filter,opacity] duration-fast ease-apple motion-reduce:transition-none',
        !colorize && 'grayscale opacity-60',
      )}
    >
      {children}
    </span>
  )
}

/**
 * ServiceHeaderRow: the one row every service opens with. The logo tile and the
 * name as the label, what it does as the caption (with an optional second line,
 * `note`), and whatever the caller's state needs as the control: a status chip,
 * an action, or both. Integrations' IntegrationHeaderRow and every Import source
 * row are this row.
 */
export function ServiceHeaderRow({
  logo,
  name,
  description,
  note,
  control,
}: {
  logo: React.ReactNode
  name: React.ReactNode
  description: React.ReactNode
  note?: React.ReactNode
  control?: React.ReactNode
}) {
  return (
    <PanelRow
      label={
        <span className="flex items-center gap-3">
          {logo}
          <span>{name}</span>
        </span>
      }
      caption={
        <>
          <span className="block">{description}</span>
          {note && <span className="mt-1 block text-xs text-muted-foreground">{note}</span>}
        </>
      }
      control={control}
    />
  )
}

export type DetailRowKind = 'text' | 'date' | 'code' | 'muted'

export interface DetailRow {
  label: string
  value: React.ReactNode
  kind?: DetailRowKind
}

/**
 * The rows under a service's header, ruled off by a hairline. A code or domain
 * value gets `font-mono`; a date gets `tabular-nums` and never mono; a
 * secondary fact (what was skipped) is muted.
 */
export function DetailRows({ rows }: { rows: DetailRow[] }) {
  return (
    <div className="border-t border-border">
      <PanelRows>
        {rows.map(row => (
          <PanelRow key={row.label} label={row.label}>
            <span
              className={cn(
                'text-sm',
                row.kind === 'code' && 'font-mono text-muted-foreground',
                row.kind === 'date' && 'tabular-nums text-muted-foreground',
                row.kind === 'muted' && 'text-muted-foreground',
                !row.kind && 'text-foreground',
              )}
            >
              {row.value}
            </span>
          </PanelRow>
        ))}
      </PanelRows>
    </div>
  )
}

/**
 * SetupReveal (M6): an inline setup form opens with a height+fade rather than
 * snapping in, house ease-apple timing (TIMING = duration-base, ease-apple).
 * Closing is a plain unmount: only the open needed the reveal, and an exit
 * animation would hold the form in the DOM after its own action closed it,
 * which is exactly the moment the vocabulary requires at most one open setup
 * form. Skipped under prefers-reduced-motion: the form still appears, just
 * without the height or opacity animation.
 */
export function SetupReveal({ show, children }: { show: boolean; children: React.ReactNode }) {
  const reducedMotion = useReducedMotion()

  if (!show) return null
  if (reducedMotion) return <>{children}</>

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      transition={TIMING}
      className="overflow-hidden"
    >
      {children}
    </motion.div>
  )
}
