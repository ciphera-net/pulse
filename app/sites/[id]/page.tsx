import DashboardSurface from '@/components/surfaces/DashboardSurface'

// The page body is a surface component so /demo and /share/<id> render the same page (PUL-34).
export default function SiteDashboardPage() {
  return <DashboardSurface />
}
