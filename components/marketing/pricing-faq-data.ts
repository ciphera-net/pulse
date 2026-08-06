// Shared pricing FAQ content, mirroring the home-faq-data shape so the pricing
// page can render the same category-rail FAQ pattern. Kept in one place so the
// billing/plans/privacy Q&A stays editable without touching the component.

export interface FAQItem {
  question: string
  answer: string
}

export const pricingFaqCategories: Record<string, string> = {
  billing: 'Billing',
  plans: 'Plans',
  privacy: 'Privacy',
}

export const pricingFaqData: Record<string, FAQItem[]> = {
  billing: [
    {
      question: 'When am I charged?',
      answer:
        "You're charged immediately when you subscribe. Your subscription renews automatically at the end of each billing period (monthly or yearly). You can cancel anytime — your plan stays active until the end of the paid period.",
    },
    {
      question: 'How does VAT work?',
      answer:
        'Prices shown are exclusive of VAT. VAT is calculated at checkout based on your country. EU businesses can enter their VAT ID to apply the reverse charge mechanism.',
    },
    {
      question: 'What payment methods do you accept?',
      answer:
        'We accept credit and debit cards (Visa, Mastercard, American Express), iDEAL, Bancontact, SEPA Direct Debit, and other European payment methods. All payments are securely processed.',
    },
    {
      question: 'Can I get a refund?',
      answer:
        "We don't offer refunds, but you can cancel your subscription anytime. Your plan stays active until the end of the current billing period. The Hobby plan is free forever, so you can always try Pulse before committing.",
    },
  ],
  plans: [
    {
      question: 'Do higher plans unlock more features?',
      answer:
        'No — every plan runs the full product. Custom events, funnels and journeys, email reports, API access, uptime monitoring, the team dashboard and shared links are included everywhere, on Hobby too. Higher plans scale the limits: more sites, more pageviews, longer data retention — and Business adds priority support.',
    },
    {
      question: 'Can I change plans anytime?',
      answer:
        'Yes. You can upgrade or downgrade your plan at any time from your billing settings. When upgrading, the new price takes effect on your next billing cycle. When downgrading, you keep your current plan until the end of the paid period.',
    },
    {
      question: 'What happens if I exceed my pageview limit?',
      answer:
        "We don't cut off your tracking. If you consistently exceed your limit, we'll reach out to help you find the right plan. We believe in fair usage, not hard cutoffs.",
    },
    {
      question: "What's the difference between Solo and Team?",
      answer:
        'Scale, not features — both run the full product. Team covers up to 5 sites instead of 1 and extends data retention from 1 year to 2. Business steps up again: 10 sites, 3-year retention, and priority support.',
    },
    {
      question: 'Do yearly plans include a discount?',
      answer:
        'Yes. Yearly plans give you 1 month free — you pay for 11 months instead of 12. The effective monthly rate is shown on each plan card when you toggle to yearly billing.',
    },
  ],
  privacy: [
    {
      question: 'Where is my data stored?',
      answer:
        'All analytics data is processed and stored on Swiss infrastructure, protected by the Swiss Federal Act on Data Protection (FADP).',
    },
    {
      question: 'Do you use cookies?',
      answer:
        "No. Pulse doesn't use cookies, fingerprinting, or any form of persistent tracking. This means you don't need a cookie consent banner when using Pulse.",
    },
    {
      question: 'Are you GDPR compliant?',
      answer:
        "Yes, by architecture — not by configuration. Pulse doesn't collect personal data as defined by GDPR Article 4. There are no data subjects in the dataset, so no DPA is required.",
    },
    {
      question: 'Can I export my data?',
      answer:
        'Yes. You own 100% of your data and can export it anytime from the dashboard as CSV, JSON, or Excel — or via the API on Team and Business. Canceling a paid plan never locks you out: your workspace continues on the free Hobby tier with your data in it.',
    },
  ],
}
