import PerformanceSurface from '@/components/surfaces/PerformanceSurface'

// The page body is a surface component so /demo and /share/<id> render the same page (PUL-34).
export default function PerformancePage() {
  return <PerformanceSurface />
}
