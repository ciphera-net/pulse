import PublicPage from '@/components/public/PublicPage'

// /share/<id>, /share/<id>/pages, /share/<id>/funnels/<funnelId>, …: which page the segments
// name, and whether this link shares it, is decided in components/public/PublicPage.
export default async function SharePage({ params }: { params: Promise<{ id: string; page?: string[] }> }) {
  const { page } = await params
  return <PublicPage segments={page ?? []} />
}
