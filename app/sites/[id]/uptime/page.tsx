import UptimeSurface from '@/components/surfaces/UptimeSurface'

// The page body is a surface component so /demo and /share/<id> render the same page (PUL-34).
export default function UptimePage() {
  return <UptimeSurface />
}
