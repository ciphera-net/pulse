'use client'

import { Input } from '@ciphera-net/facet'
import { KitRow, KitRows } from '@/components/settings/kit/Kit'
import { SkeletonLine } from '@/components/skeletons'

/** Rows still loading, in the kit's own row shape so nothing moves when the data lands. */
export function LoadingRows({ rows = 2 }: { rows?: number }) {
  return (
    <div role="status" aria-busy="true" aria-label="Loading">
      <KitRows>
        {Array.from({ length: rows }).map((_, i) => (
          <KitRow key={i} label={<SkeletonLine className="h-3.5 w-28" />} caption={<SkeletonLine className="mt-1 h-3 w-48" />} />
        ))}
      </KitRows>
    </div>
  )
}

/**
 * A field whose value is still being decrypted. The frame stays and the skeleton sits inside it, so the box does not
 * disappear and come back when the value lands.
 */
export function DecryptingField({ widthClass }: { widthClass: string }) {
  return (
    <div aria-busy="true">
      <div className="relative">
        <Input value="" readOnly tabIndex={-1} aria-hidden="true" />
        <span className="pointer-events-none absolute inset-0 flex items-center px-3.5">
          <SkeletonLine className={`h-3.5 ${widthClass}`} />
        </span>
      </div>
      <span className="sr-only">Decrypting your details…</span>
    </div>
  )
}

/** A failure under a field, in coral words. */
export function FieldError({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="mt-2 text-xs text-destructive">
      {children}
    </p>
  )
}
