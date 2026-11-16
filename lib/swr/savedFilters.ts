'use client'

import { useCallback, useMemo } from 'react'
import useSWR from 'swr'
import { createSavedFilter, deleteSavedFilter, listSavedFilters, type SavedFilter } from '@/lib/api/savedFilters'
import { useCan } from '@/lib/auth/permissions'
import { parseFiltersFromURL, serializeFilters, type DimensionFilter } from '@/lib/filters'
import { useOptionalSiteScope } from '@/lib/scope/SiteScope'

/** A saved set as the dashboard reads it: its filters parsed from the address form the server keeps. */
export interface SavedSet {
  id: string
  name: string
  filters: DimensionFilter[]
}

/** One filter in a form that does not depend on the order of its values. */
const one = (f: DimensionFilter) => `${f.dimension}|${f.operator}|${[...f.values].sort().join(';')}`
/** A set of filters in a form that does not depend on their order: two lists that filter the same visits agree. */
export const keyOf = (filters: DimensionFilter[]) => filters.map(one).sort().join(',')

/** The saved set the filters on ARE, if any. Derived every time, so a reload or a remount can never disagree. */
export function setFor(filters: DimensionFilter[], sets: SavedSet[]): SavedSet | null {
  if (filters.length === 0) return null
  const k = keyOf(filters)
  return sets.find((s) => keyOf(s.filters) === k) ?? null
}

export interface SavedFilters {
  /**
   * A member's page of a site: the saved sets show. Never on a public page. Saved filters were a beta until 16-11-2026,
   * when they went to every team, and no flag is read any more.
   */
  on: boolean
  /** The reader may save and delete them (`sites.edit`, R60). */
  canEdit: boolean
  /** The site's sets, the newest first. */
  sets: SavedSet[]
  /** Saves the filters under a name. Throws the server's refusal (lib/api/savedFilters: saveRefusal reads it). */
  save: (name: string, filters: DimensionFilter[]) => Promise<void>
  /** Deletes a set; it leaves the list at once and comes back if the server refuses. */
  remove: (id: string) => Promise<void>
}

/** The SWR key of a site's saved filters. */
export const savedFiltersKey = (siteId: string) => ['savedFilters', siteId] as const

export function useSavedFilters(): SavedFilters {
  const scope = useOptionalSiteScope()
  const canEdit = useCan('sites.edit')
  const siteId = scope && scope.mode !== 'public' ? scope.siteId : null
  const on = siteId !== null
  const { data, mutate } = useSWR<SavedFilter[]>(on && siteId ? savedFiltersKey(siteId) : null, () => listSavedFilters(siteId as string), {
    revalidateOnFocus: false,
  })
  const sets = useMemo(
    () => (data ?? []).map((s) => ({ id: s.id, name: s.name, filters: parseFiltersFromURL(s.filters) })).filter((s) => s.filters.length > 0),
    [data],
  )
  const save = useCallback(
    async (name: string, filters: DimensionFilter[]) => {
      if (!siteId) return
      const created = await createSavedFilter(siteId, { name, filters: serializeFilters(filters) })
      await mutate((current) => [created, ...(current ?? []).filter((s) => s.id !== created.id)], { revalidate: false })
    },
    [siteId, mutate],
  )
  const remove = useCallback(
    async (id: string) => {
      if (!siteId) return
      const without = (current: SavedFilter[] | undefined) => (current ?? []).filter((s) => s.id !== id)
      await mutate(
        async (current) => {
          await deleteSavedFilter(siteId, id)
          return without(current)
        },
        { optimisticData: without, rollbackOnError: true, revalidate: false },
      )
    },
    [siteId, mutate],
  )
  return { on, canEdit: on && canEdit, sets, save, remove }
}
