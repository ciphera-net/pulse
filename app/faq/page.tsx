'use client'

import { motion } from 'framer-motion'
import PulseFAQ from '@/components/marketing/PulseFAQ'

// * JSON-LD FAQ Schema for rich snippets
const faqs = [
  { question: "Is Pulse GDPR compliant?", answer: "Yes, Pulse is GDPR compliant by design. We don't use cookies, don't collect personal data, and process all data anonymously." },
  { question: "Do I need a cookie consent banner?", answer: "No, you don't need a cookie consent banner. Pulse doesn't use cookies, so it's exempt from cookie consent requirements under GDPR." },
  { question: "How does Pulse track visitors?", answer: "We use a lightweight JavaScript snippet that sends anonymous pageview events. No cookies, no cross-session identifiers (we use sessionStorage only to group events within a single visit), and no cross-site tracking." },
  { question: "What data does Pulse collect?", answer: "We collect anonymous pageview data including page path, referrer, device type, browser, and country (derived from IP at request time; the IP itself is not stored). No personal information is collected." },
  { question: "How accurate is the data?", answer: "Our data is highly accurate. We exclude bot traffic and data center visits. Since we don't use cookies, we count unique sessions rather than unique users." },
  { question: "Can I export my data?", answer: "Yes, you can access all your analytics data through the dashboard. We're working on export functionality for bulk data downloads." },
]

const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqs.map((faq) => ({
    '@type': 'Question',
    name: faq.question,
    acceptedAnswer: {
      '@type': 'Answer',
      text: faq.answer,
    },
  })),
}

export default function FAQPage() {
  return (
    <>
      {/* * JSON-LD FAQ Schema */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />

      <div className="pt-8 pb-16">
        <PulseFAQ />

        {/* * CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="text-center mt-12"
        >
          <p className="text-neutral-400 mb-4">
            Still have questions?
          </p>
          <a
            href="mailto:support@ciphera.net"
            className="inline-flex items-center justify-center gap-2 bg-neutral-900 border border-neutral-800 text-white px-5 py-2.5 rounded-xl font-medium hover:bg-neutral-800 transition-all duration-200"
          >
            Contact us
          </a>
        </motion.div>
      </div>
    </>
  )
}
