import PagesSurface from '@/components/surfaces/PagesSurface'

// The page body is a surface component so /demo and /share/<id> render the same page (PUL-34).
export default function PagesPage() {
  return <PagesSurface />
}
