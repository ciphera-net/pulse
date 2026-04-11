import type { Metadata } from 'next'
import { FAVICON_SERVICE_URL } from '@/lib/utils/favicon'

// NEXT_PUBLIC_API_URL is inlined at build time. Required — no fallback.
const API_URL = process.env.NEXT_PUBLIC_API_URL
if (!API_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is not set. See .env.example.')
}

interface SharePageParams {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: SharePageParams): Promise<Metadata> {
  const { id } = await params
  const fallback: Metadata = {
    title: 'Public Dashboard | Pulse',
    description: 'Privacy-first web analytics — view this site\'s public stats.',
    openGraph: {
      title: 'Public Dashboard | Pulse',
      description: 'Privacy-first web analytics — view this site\'s public stats.',
      siteName: 'Pulse by Ciphera',
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title: 'Public Dashboard | Pulse',
      description: 'Privacy-first web analytics — view this site\'s public stats.',
    },
  }

  try {
    const res = await fetch(`${API_URL}/public/sites/${id}/dashboard?limit=1`, {
      next: { revalidate: 3600 },
    })
    if (!res.ok) return fallback

    const data = await res.json()
    const domain = data?.site?.domain
    if (!domain) return fallback

    const title = `${domain} analytics | Pulse`
    const description = `Live, privacy-first analytics for ${domain} — powered by Pulse.`

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        siteName: 'Pulse by Ciphera',
        type: 'website',
        images: [{
          url: `${FAVICON_SERVICE_URL}?domain=${domain}&sz=128`,
          width: 128,
          height: 128,
          alt: `${domain} favicon`,
        }],
      },
      twitter: {
        card: 'summary',
        title,
        description,
      },
    }
  } catch {
    return fallback
  }
}

export default function ShareLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
