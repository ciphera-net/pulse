import { redirect } from 'next/navigation'

const TAB_MAP: Record<string, string> = {
  general: 'general',
  visibility: 'visibility',
  data: 'privacy',
  privacy: 'privacy',
  bot: 'bot-spam',
  goals: 'goals',
  notifications: 'reports',
  integrations: 'integrations',
}

export default async function SiteSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { id } = await params
  const sp = await searchParams

  // GSC OAuth callback — preserve the status param on the integrations tab
  const gsc = typeof sp.gsc === 'string' ? sp.gsc : null
  if (gsc) {
    redirect(`/sites/${id}/settings/integrations?gsc=${gsc}`)
  }

  // Legacy ?tab= deep links
  const tab = typeof sp.tab === 'string' ? sp.tab : null
  const mappedTab = tab ? (TAB_MAP[tab] ?? 'general') : 'general'
  redirect(`/sites/${id}/settings/${mappedTab}`)
}
