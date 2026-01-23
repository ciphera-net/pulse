export default function FAQPage() {
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

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <h1 className="text-3xl font-bold mb-8 text-neutral-900 dark:text-white">
        Frequently Asked Questions
      </h1>
      
      <div className="space-y-6">
        {faqs.map((faq, index) => (
          <div key={index} className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-6">
            <h2 className="text-xl font-semibold mb-3 text-neutral-900 dark:text-white">
              {faq.question}
            </h2>
            <p className="text-neutral-600 dark:text-neutral-400">
              {faq.answer}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
