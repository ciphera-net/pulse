import type { Metadata } from 'next'
import ContactSection from '@/components/marketing/ContactSection'
import { DEFAULT_OG_IMAGES } from '@/lib/og'
import { seoFor } from '@/lib/seo'

const description =
  'Talk to the team behind Pulse — sales and custom plans, technical support, billing, or security. Every message lands in a human inbox.'

// Level 1: merged with a WordPress stub for '/contact' when one exists (design §4.3).
export const metadata: Metadata = seoFor('/contact', {
  title: 'Contact',
  description,
  alternates: {
    canonical: '/contact',
  },
  openGraph: {
    title: 'Contact',
    description,
    siteName: 'Pulse Analytics',
    images: DEFAULT_OG_IMAGES,
  },
})

export default function ContactPage() {
  return <ContactSection />
}
