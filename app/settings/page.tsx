import { redirect } from 'next/navigation'

const TAB_MAP: Record<string, string> = {
  general:       'workspace',
  members:       'members',
  billing:       'billing',
  notifications: 'notifications',
  audit:         'audit',
}

export default async function GlobalSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const tab = typeof sp.tab === 'string' ? sp.tab : null
  const destination = tab ? (TAB_MAP[tab] ?? 'workspace') : 'workspace'
  redirect(`/settings/${destination}`)
}
