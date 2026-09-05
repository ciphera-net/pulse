// The /startups FAQ content, in the same category-rail shape as the
// open-source set. Programme terms decided 05-09-2026; the trade is the same
// one the open-source programme makes (name and logo permission), because that
// is the asset Pulse measurably lacks and the thing a free tier has to buy to
// survive the 03-09 ruling that a bare grant never converts.

import type { FAQItem } from '@/components/marketing/opensource-faq-data'

export const startupsFaqCategories: Record<string, string> = {
  applying: 'Applying',
  plan: 'The plan',
}

export const startupsFaqData: Record<string, FAQItem[]> = {
  applying: [
    {
      question: 'What counts as a startup here?',
      answer:
        'Founded in the last two years, ten people or fewer, and not past a seed round. Something in between? Apply anyway. A human reads every application.',
    },
    {
      question: 'How long does approval take?',
      answer:
        'A human reads every application. Expect an answer at your contact address within a few days.',
    },
    {
      question: 'Do I need a Pulse account to apply?',
      answer:
        'No. Apply first, sign up whenever. Approval sends a link that attaches the plan to whichever workspace you claim it from. The free tier works without a card in the meantime.',
    },
    {
      question: 'We already pay for Pulse. Can we switch?',
      answer:
        'Yes, if you qualify. Apply as normal and say so in the description; the switch is done by hand so nothing is billed twice.',
    },
  ],
  plan: [
    {
      question: 'What exactly is included?',
      answer:
        'The Team tier\u2019s limits, free for a year: five sites, 100,000 pageviews a month, 2-year data retention, and every feature. Funnels, journeys, uptime, performance, the API. No plan gates any.',
    },
    {
      question: 'What happens after the year?',
      answer:
        'We talk. If you are still small, it renews. If you have grown into a paying customer, that is the outcome we were hoping for and the price is on the pricing page.',
    },
    {
      question: 'What do you get out of it?',
      answer:
        'Permission to show your company\u2019s name and logo as a Pulse user, and honest usage that hardens the product. A testimonial only if the product earns one, never a condition.',
    },
  ],
}
