import type { Metadata } from 'next'
import ContactSection from '@/components/marketing/ContactSection'
import { DEFAULT_OG_IMAGES } from '@/lib/og'

const description =
  'Talk to the team behind Pulse — sales and custom plans, technical support, billing, or security. Every message lands in a human inbox.'

export const metadata: Metadata = {
  title: 'Contact',
  description,
  alternates: {
    canonical: '/contact',
  },
  openGraph: {
    title: 'Contact',
    description,
    siteName: 'Pulse by Ciphera',
    images: DEFAULT_OG_IMAGES,
  },
}

export default function ContactPage() {
  return <ContactSection />
}
