'use client'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'

const CATEGORIES = [
  { id: 'billing', label: 'Billing' },
  { id: 'security', label: 'Security' },
  { id: 'uptime', label: 'Uptime' },
  { id: 'site', label: 'Site' },
  { id: 'team', label: 'Team' },
  { id: 'system', label: 'System' },
] as const

interface FilterChipsProps {
  unreadCount: number
  totalCount: number
}

export default function FilterChips({ unreadCount, totalCount }: FilterChipsProps) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const state = params.get('state') ?? 'all'
  const activeCats = (params.get('category') ?? '').split(',').filter(Boolean)

  const setParam = (next: URLSearchParams) => {
    const s = next.toString()
    router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false })
  }

  const toggleState = (v: 'all' | 'unread') => {
    const next = new URLSearchParams(params)
    if (v === 'all') next.delete('state')
    else next.set('state', v)
    setParam(next)
  }

  const toggleCat = (id: string) => {
    const set = new Set(activeCats)
    set.has(id) ? set.delete(id) : set.add(id)
    const next = new URLSearchParams(params)
    if (set.size > 0) next.set('category', Array.from(set).join(','))
    else next.delete('category')
    setParam(next)
  }

  const chip = (label: string, active: boolean, onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1 rounded-full text-xs transition-colors ${
        active
          ? 'bg-brand-orange/15 text-brand-orange'
          : 'bg-white/[0.05] text-neutral-400 hover:text-white hover:bg-white/[0.08]'
      }`}
    >
      {label}
    </button>
  )

  return (
    <div className="flex items-center gap-2 flex-wrap mb-4">
      {chip(`All · ${totalCount}`, state === 'all', () => toggleState('all'))}
      {chip(`Unread · ${unreadCount}`, state === 'unread', () => toggleState('unread'))}
      <div className="w-px h-5 bg-white/10 mx-1" />
      {CATEGORIES.map(c =>
        <span key={c.id}>{chip(c.label, activeCats.includes(c.id), () => toggleCat(c.id))}</span>
      )}
    </div>
  )
}
