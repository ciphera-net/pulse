'use client'

import { motion } from 'framer-motion'
import { useState } from 'react'
import { ChevronDownIcon } from '@ciphera-net/ui'

const faqs = [
  {
    question: "Is Pulse GDPR compliant?",
    answer: "Yes, Pulse is GDPR compliant by design. We don't use cookies, don't collect personal data, and process all data anonymously."
  },
  {
    question: "Do I need a cookie consent banner?",
    answer: "No, you don't need a cookie consent banner. Pulse doesn't use cookies, so it's exempt from cookie consent requirements under GDPR."
  },
  {
    question: "How does Pulse track visitors?",
    answer: "We use a lightweight JavaScript snippet that sends anonymous pageview events. No cookies, no cross-session identifiers (we use sessionStorage only to group events within a single visit), and no cross-site tracking."
  },
  {
    question: "What data does Pulse collect?",
    answer: "We collect anonymous pageview data including page path, referrer, device type, browser, and country (derived from IP at request time; the IP itself is not stored). No personal information is collected."
  },
  {
    question: "How accurate is the data?",
    answer: "Our data is highly accurate. We exclude bot traffic and data center visits. Since we don't use cookies, we count unique sessions rather than unique users."
  },
  {
    question: "Can I export my data?",
    answer: "Yes, you can access all your analytics data through the dashboard. We're working on export functionality for bulk data downloads."
  }
]

// * JSON-LD FAQ Schema for rich snippets
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

function FAQItem({ faq, index }: { faq: typeof faqs[0]; index: number }) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay: index * 0.05 }}
      className="border-b border-neutral-200 dark:border-neutral-800"
    >
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full py-6 flex items-center justify-between text-left hover:text-brand-orange transition-colors"
      >
        <h3 className="text-lg font-semibold text-neutral-900 dark:text-white pr-4">
          {faq.question}
        </h3>
        <ChevronDownIcon
          className={`w-5 h-5 text-neutral-500 shrink-0 transition-transform duration-300 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.3 }}
          className="pb-6"
        >
          <p className="text-neutral-600 dark:text-neutral-400 leading-relaxed">
            {faq.answer}
          </p>
        </motion.div>
      )}
    </motion.div>
  )
}

export default function FAQPage() {
  return (
    <>
      {/* * JSON-LD FAQ Schema */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      
      <div className="container mx-auto px-4 py-16 max-w-4xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <span className="badge-primary mb-4 inline-flex">FAQ</span>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-neutral-900 dark:text-white mb-4">
            Frequently asked questions
          </h1>
          <p className="text-lg text-neutral-600 dark:text-neutral-400 max-w-2xl mx-auto">
            Learn more about how Pulse respects your privacy and handles your data.
          </p>
        </motion.div>

        <div className="max-w-3xl mx-auto">
          {faqs.map((faq, index) => (
            <FAQItem key={index} faq={faq} index={index} />
          ))}
        </div>

        {/* * CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="text-center mt-12"
        >
          <p className="text-neutral-600 dark:text-neutral-400 mb-4">
            Still have questions?
          </p>
          <a
            href="mailto:support@ciphera.net"
            className="inline-flex items-center justify-center gap-2 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-neutral-900 dark:text-white px-5 py-2.5 rounded-xl font-medium hover:bg-neutral-50 dark:hover:bg-neutral-800 shadow-sm hover:shadow-md dark:shadow-none transition-all duration-200"
          >
            Contact us
          </a>
        </motion.div>
      </div>
    </>
  )
}
