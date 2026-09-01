// Shared Pulse FAQ content, consumed by the home page's category-rail FAQ and
// the /faq page, so the Q&A stays in one place.

export interface FAQItem {
  question: string
  answer: string
}

export const faqCategories: Record<string, string> = {
  general: 'General',
  setup: 'Setup',
  privacy: 'Privacy & Compliance',
  technical: 'Technical',
}

export const faqData: Record<string, FAQItem[]> = {
  general: [
    {
      question: 'What is Pulse?',
      answer:
        "Pulse is a privacy-first website analytics platform by Ciphera. It tracks pageviews, unique visitors, referrers, and geographic data without using cookies, fingerprinting, or collecting any personal data. It's a privacy-respecting alternative to Google Analytics.",
    },
    {
      question: 'Is Pulse free?',
      answer:
        'Yes, Pulse is free for personal websites. We plan to offer a paid Pro tier for teams and high-traffic sites in the future, but the free tier will always be available.',
    },
    {
      question: 'Can I migrate from Google Analytics?',
      answer:
        "Pulse is not a drop-in replacement for Google Analytics — it's fundamentally different by design. There are no accounts, no cross-site identity and no history beyond a calendar month, so GA's user-level exports have nothing to map onto and can't be imported. However, you can run both side by side during a transition period.",
    },
    {
      question: 'Is Pulse open source?',
      answer:
        'The Pulse client — dashboard and tracking script — are open source and available on GitHub. You can inspect every line of code that runs on your site and verify our privacy claims.',
    },
  {
    question: "Why isn't the backend open source?",
    answer:
      "We open-source everything that runs where trust matters: the tracking script on your visitors' browsers, the dashboard, the CLI, and the API types — every line is on GitHub. The managed cloud backend is closed, the same model Proton uses: auditable clients, operated core. If you want to verify what we collect, the script is the place to look — and the live demo shows exactly what we see.",
  },
    {
      question: 'How is Pulse different from Plausible or Fathom?',
      answer:
        "Pulse shares the privacy-first philosophy with Plausible and Fathom, but it's built on Swiss infrastructure with Swiss data protection laws. The client — dashboard and tracking script — are open source, and Pulse is part of the Ciphera ecosystem, giving you a unified privacy-first stack.",
    },
  ],
  setup: [
    {
      question: 'How do I install Pulse?',
      answer:
        "Add a single script tag to your site's <head> section. That's it. No npm packages, no build steps, no configuration files. The script is about 5 KB gzipped and loads asynchronously.",
    },
    {
      question: 'Does Pulse work with my framework?',
      answer:
        'Yes. Pulse works with any website or framework: plain HTML, React, Next.js, Vue, Nuxt, Svelte, WordPress, Shopify, and more. If it renders HTML, Pulse works with it.',
    },
    {
      question: 'How do I verify Pulse is working?',
      answer:
        'After adding the script tag, visit your site and check the Pulse dashboard. You should see your visit appear in real-time within seconds. The dashboard shows a live visitor count and updates every few seconds.',
    },
    {
      question: 'Can I track multiple websites?',
      answer:
        'Yes. Each website gets its own dashboard. You can add as many sites as you need from the Pulse dashboard by adding the script tag with a different data-domain attribute.',
    },
    {
      question: 'Does Pulse slow down my website?',
      answer:
        'No. The Pulse script is about 5 KB gzipped — roughly 25x smaller than Google Analytics. It loads asynchronously with the defer attribute, meaning it never blocks page rendering or affects your Core Web Vitals scores.',
    },
  ],
  privacy: [
    {
      question: 'Do I need a cookie consent banner for Pulse?',
      answer:
        "No. Because Pulse doesn't use cookies, fingerprinting, or any form of persistent identifier, it's exempt from ePrivacy cookie consent requirements. You can use Pulse without any consent banner.",
    },
    {
      question: 'Is Pulse GDPR compliant?',
      answer:
        "Yes, by architecture — not by configuration. Pulse doesn't collect any personal data as defined by GDPR Article 4. There are no data subjects in the dataset, so DSAR requests don't apply. No DPA is required.",
    },
    {
      question: 'What happens to IP addresses?',
      answer:
        'IP addresses are used only at the network edge for country-level geolocation. They are immediately discarded after the geo lookup — never stored, never logged, never written to disk. We can’t retrieve them even if asked.',
    },
    {
      question: 'Where is my analytics data stored?',
      answer:
        'All data is processed and stored on Swiss infrastructure, protected by the Swiss Federal Act on Data Protection (FADP). Data never leaves Swiss jurisdiction.',
    },
    {
      question: 'Can Pulse identify individual users?',
      answer:
        'No — it cannot tell you who someone is. Pageviews are grouped by short-lived, server-derived identifiers (a daily session hash and a monthly visitor hash) with no client-side storage, no name, no email and no way to link activity across sites or beyond a calendar month. A site owner can switch on visitor-level views to read those groupings one reader at a time; it is off by default, per site, and what it shows is a pseudonym that stops existing at the end of the month.',
    },
  ],
  technical: [
    {
      question: 'How does Pulse count unique visitors without cookies?',
      answer:
        "Pulse derives two identifiers server-side from non-personal data points: a session identifier that rotates daily and a visitor identifier that rotates monthly, both scoped to your site's timezone. Unique visitor counts are deduplicated within each calendar month, and nothing can follow a person across sites or beyond that month.",
    },
    {
      question: 'Does Pulse have an API?',
      answer:
        'Yes. Pulse provides a REST API for programmatic access to your analytics data. You can use it to build custom dashboards, integrate with other tools, or export your data.',
    },
    {
      question: 'What metrics does Pulse track?',
      answer:
        'Pulse tracks pageviews, unique visitors, bounce rate, visit duration, referrer sources, UTM parameters, device type, browser, operating system, and country-level geolocation.',
    },
    {
      question: 'Can I export my data?',
      answer:
        'Yes. The dashboard includes an export feature that lets you download your analytics data. You can also use the API for automated exports.',
    },
    {
      question: 'Does Pulse support custom events?',
      answer:
        'Custom event tracking is on our roadmap. Currently, Pulse focuses on pageview analytics. We plan to add lightweight custom event support that maintains our zero-personal-data architecture.',
    },
  ],
}
