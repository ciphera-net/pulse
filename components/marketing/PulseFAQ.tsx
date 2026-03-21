'use client'

import { FAQ } from '@/components/marketing/FAQ'

const categories: Record<string, string> = {
  general: "General",
  setup: "Setup",
  privacy: "Privacy & Compliance",
  technical: "Technical",
}

const faqData: Record<string, { question: string; answer: string }[]> = {
  general: [
    {
      question: "What is Pulse?",
      answer: "Pulse is a privacy-first website analytics platform by Ciphera. It tracks pageviews, unique visitors, referrers, and geographic data without using cookies, fingerprinting, or collecting any personal data. It's a privacy-respecting alternative to Google Analytics.",
    },
    {
      question: "Is Pulse free?",
      answer: "Yes, Pulse is free for personal websites. We plan to offer a paid Pro tier for teams and high-traffic sites in the future, but the free tier will always be available.",
    },
    {
      question: "Can I migrate from Google Analytics?",
      answer: "Pulse is not a drop-in replacement for Google Analytics — it's fundamentally different by design. It doesn't track individual users or sessions, so historical GA data can't be imported. However, you can run both side by side during a transition period.",
    },
    {
      question: "Is Pulse open source?",
      answer: "The Pulse client — dashboard and tracking script — are open source and available on GitHub. You can inspect every line of code that runs on your site and verify our privacy claims.",
    },
    {
      question: "How is Pulse different from Plausible or Fathom?",
      answer: "Pulse shares the privacy-first philosophy with Plausible and Fathom, but it's built on Swiss infrastructure with Swiss data protection laws. The client — dashboard and tracking script — are open source, and Pulse is part of the Ciphera ecosystem, giving you a unified privacy-first stack.",
    },
  ],
  setup: [
    {
      question: "How do I install Pulse?",
      answer: "Add a single script tag to your site's <head> section. That's it. No npm packages, no build steps, no configuration files. The script is under 2KB gzipped and loads asynchronously.",
    },
    {
      question: "Does Pulse work with my framework?",
      answer: "Yes. Pulse works with any website or framework: plain HTML, React, Next.js, Vue, Nuxt, Svelte, WordPress, Shopify, and more. If it renders HTML, Pulse works with it.",
    },
    {
      question: "How do I verify Pulse is working?",
      answer: "After adding the script tag, visit your site and check the Pulse dashboard. You should see your visit appear in real-time within seconds. The dashboard shows a live visitor count and updates every few seconds.",
    },
    {
      question: "Can I track multiple websites?",
      answer: "Yes. Each website gets its own dashboard. You can add as many sites as you need from the Pulse dashboard by adding the script tag with a different data-domain attribute.",
    },
    {
      question: "Does Pulse slow down my website?",
      answer: "No. The Pulse script is under 2KB gzipped — about 20x smaller than Google Analytics. It loads asynchronously with the defer attribute, meaning it never blocks page rendering or affects your Core Web Vitals scores.",
    },
  ],
  privacy: [
    {
      question: "Do I need a cookie consent banner for Pulse?",
      answer: "No. Because Pulse doesn't use cookies, fingerprinting, or any form of persistent identifier, it's exempt from ePrivacy cookie consent requirements. You can use Pulse without any consent banner.",
    },
    {
      question: "Is Pulse GDPR compliant?",
      answer: "Yes, by architecture — not by configuration. Pulse doesn't collect any personal data as defined by GDPR Article 4. There are no data subjects in the dataset, so DSAR requests don't apply. No DPA is required.",
    },
    {
      question: "What happens to IP addresses?",
      answer: "IP addresses are used only at the network edge for country-level geolocation. They are immediately discarded after the geo lookup — never stored, never logged, never written to disk. We can't retrieve them even if asked.",
    },
    {
      question: "Where is my analytics data stored?",
      answer: "All data is processed and stored on Swiss infrastructure, protected by the Swiss Federal Act on Data Protection (FADP). Data never leaves Swiss jurisdiction.",
    },
    {
      question: "Can Pulse identify individual users?",
      answer: "No. Pulse is architecturally incapable of identifying individual users. Each pageview is treated as an independent, anonymous event. There are no user IDs, session IDs, or any form of persistent tracking.",
    },
  ],
  technical: [
    {
      question: "How does Pulse count unique visitors without cookies?",
      answer: "Pulse uses a privacy-safe hashing method that generates a daily rotating identifier from non-personal data points. This allows approximate unique visitor counts without tracking individuals across sessions or days.",
    },
    {
      question: "Does Pulse have an API?",
      answer: "Yes. Pulse provides a REST API for programmatic access to your analytics data. You can use it to build custom dashboards, integrate with other tools, or export your data.",
    },
    {
      question: "What metrics does Pulse track?",
      answer: "Pulse tracks pageviews, unique visitors, bounce rate, visit duration, referrer sources, UTM parameters, device type, browser, operating system, and country-level geolocation.",
    },
    {
      question: "Can I export my data?",
      answer: "Yes. The dashboard includes an export feature that lets you download your analytics data. You can also use the API for automated exports.",
    },
    {
      question: "Does Pulse support custom events?",
      answer: "Custom event tracking is on our roadmap. Currently, Pulse focuses on pageview analytics. We plan to add lightweight custom event support that maintains our zero-personal-data architecture.",
    },
  ],
}

export default function PulseFAQ() {
  return (
    <FAQ
      title="Frequently Asked Questions"
      subtitle="Everything you need to know about Pulse"
      categories={categories}
      faqData={faqData}
    />
  )
}
