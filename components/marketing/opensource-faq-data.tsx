// The /open-source FAQ content, in the shared category-rail shape (mirrors
// pricing-faq-data / home-faq-data so all three pages read as one system).
// Question set ruled by the owner 02-09-2026: purely practical, applicant-
// focused. Program facts per docs/plans/02-09-2026-opensource-plan-design.md.

export interface FAQItem {
  question: string
  answer: React.ReactNode
}

export const opensourceFaqCategories: Record<string, string> = {
  applying: 'Applying',
  plan: 'The plan',
}

export const opensourceFaqData: Record<string, FAQItem[]> = {
  applying: [
    {
      question: 'How long does approval take?',
      answer:
        'A human reads every application — expect an answer at your contact address within a few days.',
    },
    {
      question: 'Do I need a Pulse account to apply?',
      answer:
        'No. Apply first, sign up whenever — approval sends a link that attaches the plan to whichever workspace you claim it from. The free tier works without a card in the meantime.',
    },
    {
      question: 'What qualifies as open source here?',
      answer:
        'A project under an OSI-approved license, with real users beyond the maintainer. Something in between the doors? Apply anyway — every application is read.',
    },
    {
      question: 'We’re a nonprofit, not a software project — can we apply?',
      answer:
        'Yes. Registered nonprofits and NGOs qualify — any country, any cause. Software not required.',
    },
  ],
  plan: [
    {
      question: 'What exactly is included?',
      answer:
        'The Team tier’s limits, free: five sites, 100,000 pageviews a month, 2-year data retention, and every feature — funnels, journeys, uptime, performance, the API. No plan gates any.',
    },
    {
      question: 'What if we outgrow 100,000 pageviews?',
      answer:
        'Tell us. The limit is set per grant and gets raised for real projects — outgrowing it is the kind of problem we like.',
    },
    {
      question: 'What do you get out of it?',
      answer:
        'Permission to show your project’s name and logo as a Pulse user, and honest usage that hardens the product. A testimonial only if the product earns one — never a condition.',
    },
  ],
}
