import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

// Server-safe mirror of @ciphera-net/facet's `cn`. Facet's barrel file starts
// with a top-level "use client" directive, so importing `cn` from `@/lib/utils`
// (which re-exports facet) forces every consumer into the client bundle. The
// five `components/marketing/system/*` primitives are meant to render from
// Server Components (e.g. the changelog page) and only need class merging —
// pulling that in from here keeps them client-directive-free.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
