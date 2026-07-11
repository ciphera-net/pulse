'use client'

import { FAQ } from '@/components/marketing/FAQ'
import { faqCategories, faqData } from '@/components/marketing/home-faq-data'

export default function PulseFAQ() {
  return (
    <FAQ
      title="Frequently Asked Questions"
      subtitle="Everything you need to know about Pulse"
      categories={faqCategories}
      faqData={faqData}
    />
  )
}
