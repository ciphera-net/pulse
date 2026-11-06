'use client'

import * as React from 'react'
import { Button } from '@ciphera-net/facet'
import { WarningCircle } from '@phosphor-icons/react'
import { KitRow, KitRows } from '@/components/settings/kit/Kit'
import { formatDateTimeFull } from '@/lib/utils/formatDate'
import { ago } from './format'

/** Placeholder rows while a list loads: settings' house loading idiom, drawn in the kit's own row instead of a panel. */
export function LoadingRows({ label, rows }: { label: string; rows: number }) {
  return (
    <div role="status" aria-busy="true" aria-label={label} className="animate-skeleton-fade">
      <KitRows>
        {Array.from({ length: rows }, (_, i) => (
          <KitRow
            key={i}
            label={<span className="block h-3.5 w-32 bg-input" />}
            caption={<span className="block h-3 w-64 max-w-full bg-input" />}
          />
        ))}
      </KitRows>
    </div>
  )
}

/** A list that failed to load: what failed, with its coral state (R32), and Try again (copy deck §11.2, §11.3). */
export function LoadErrorRow({ title, onRetry, retrying }: { title: string; onRetry: () => void; retrying: boolean }) {
  return (
    <div role="alert">
      <KitRow
        state
        tone="coral"
        icon={<WarningCircle weight="fill" />}
        label={title}
        control={
          <Button variant="outline" size="sm" onClick={onRetry} disabled={retrying}>
            {retrying ? 'Retrying…' : 'Try again'}
          </Button>
        }
      />
    </div>
  )
}

/** "Last used 27 min ago", the full stamp on hover; "Never used" when nothing has used it (null, never a date). */
export function LastUsed({ iso, zone }: { iso: string | null; zone: string }) {
  if (!iso) return <>Never used</>
  return <span title={formatDateTimeFull(new Date(iso), zone)}>Last used {ago(iso, zone)}</span>
}
