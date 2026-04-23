import { ReadonlyURLSearchParams } from 'next/navigation'

export function preservePlanParams(searchParams: ReadonlyURLSearchParams): string {
  const params = new URLSearchParams()
  const plan = searchParams.get('plan')
  const interval = searchParams.get('interval')
  const limit = searchParams.get('limit')
  if (plan) params.set('plan', plan)
  if (interval) params.set('interval', interval)
  if (limit) params.set('limit', limit)
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}
