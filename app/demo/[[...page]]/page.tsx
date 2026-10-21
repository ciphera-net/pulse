import PublicPage from '@/components/public/PublicPage'

// /demo, /demo/pages, /demo/funnels/<id>, …: which page the segments name, and whether the
// sample site shares it, is decided in components/public/PublicPage.
export default async function DemoPage({ params }: { params: Promise<{ page?: string[] }> }) {
  const { page } = await params
  return <PublicPage segments={page ?? []} />
}
