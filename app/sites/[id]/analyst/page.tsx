import AnalystRoute from '@/components/analyst/AnalystRoute'

// Analyst, the AI analyst for one site: a beta behind the barry flag (PUL-78).
export default async function AnalystPageRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <AnalystRoute siteId={id} />
}
