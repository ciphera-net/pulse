/**
 * @file Stack-specific deep-dive content for the ten highest-traffic
 * integrations. Rendered as an extra section on /integrations/[slug] for these
 * slugs only; the other ~65 guides render without it. Each entry explains why
 * cookieless analytics fits that specific stack (rendering model, script weight,
 * the consent-banner component you don't have to build) and links to the
 * matching comparison or category page.
 *
 * ! Facts must be accurate to how each framework actually renders. No invented
 * ! benchmarks — "a couple of kilobytes, loaded async" is the honest weight
 * ! claim used site-wide.
 */

export interface IntegrationDeepDive {
  heading: string
  /** Stack-specific prose, one string per paragraph. */
  paragraphs: string[]
  /** Contextual cross-link into the /vs cluster or a category page. */
  link: { label: string; href: string }
}

export const integrationDeepDives: Record<string, IntegrationDeepDive> = {
  nextjs: {
    heading: 'Why cookieless analytics fits Next.js',
    paragraphs: [
      'Next.js gives you server-rendered and streamed HTML, and the last thing you want to do is undo that with a heavy, render-blocking analytics tag. Pulse loads through a single `next/script` include in your root layout — a couple of kilobytes, fetched asynchronously — so it never blocks the server response and never enters your React component tree. Because it is not a component, it adds nothing to your client bundle and costs nothing at hydration.',
      'It also spares you a whole category of App Router plumbing. With cookie-based analytics you would be wiring a consent-mode wrapper around `next/script`, gating it behind a consent provider, and shipping a banner component in your layout. Pulse sets no cookies, so none of that exists: no consent context, no banner in your tree, no hydration mismatch between the server-rendered banner state and the client. You drop one script tag and you are measuring every visitor.',
    ],
    link: { label: 'Compare Pulse and Google Analytics', href: '/vs/google-analytics' },
  },
  react: {
    heading: 'Why cookieless analytics fits React',
    paragraphs: [
      'A React SPA — Create React App, Vite, or any client-rendered setup — already ships a meaningful JavaScript bundle, so every extra kilobyte counts. Pulse’s script is a couple of kilobytes loaded from `index.html`, entirely outside your component tree, and it records SPA route changes through the History API without you writing a `useEffect` for it. There is no analytics provider to thread through context and no re-render cost.',
      'Cookieless also means there is no client-side cookie state for React to manage. You are not building a consent context, persisting an accept/decline flag, or conditionally mounting a banner — all of which are fiddly to get right in a single-page app where the first paint matters. Pulse collects no personal data and needs no consent, so the SPA just… reports pageviews.',
    ],
    link: { label: 'How cookieless analytics works', href: '/cookieless-analytics' },
  },
  wordpress: {
    heading: 'Why cookieless analytics fits WordPress',
    paragraphs: [
      'WordPress sites live or die on page weight and plugin sprawl, and the official Pulse plugin adds neither a bloated tag nor a database of visitor cookies. It injects one small, static, async script — which means it plays nicely with caching plugins and CDNs, since there is no per-visitor cookie to bust the cache. No theme edits, no functions.php surgery.',
      'The bigger win is what you get to remove. A typical WordPress stack pairs Google Analytics with a separate cookie-consent plugin to stay lawful in the EU — two plugins, a banner on every page, and a steady stream of consent prompts. Pulse sets no cookies, so the consent plugin is simply unnecessary: fewer plugins, no banner, and a visitor count that is not gated behind an opt-in.',
    ],
    link: { label: 'GDPR-compliant analytics', href: '/gdpr-compliant-analytics' },
  },
  vue: {
    heading: 'Why cookieless analytics fits Vue',
    paragraphs: [
      'Whether you are on Vue 3 with Vite or maintaining a Vue 2 app, Pulse installs as one async script in `index.html` and tracks route changes through Vue Router without a plugin or a global mixin. It sits outside the reactive system entirely, so there is no reactivity overhead and nothing to register in your app instance.',
      'And because it is cookieless, there is no consent state to make reactive. You are not storing an accept/decline flag, watching it, or toggling a banner component in your root layout — the kind of cross-cutting concern that is annoying to model cleanly in a component framework. Pulse collects no personal data and needs no banner, so the whole consent layer disappears.',
    ],
    link: { label: 'How cookieless analytics works', href: '/cookieless-analytics' },
  },
  angular: {
    heading: 'Why cookieless analytics fits Angular',
    paragraphs: [
      'Angular apps ship a substantial framework runtime, so a lightweight analytics tag is welcome. Pulse loads as a single async script from `index.html`, independent of Angular’s dependency-injection graph — there is no analytics service to provide, no `Router` event subscription to wire up by hand, and nothing added to your bundle budget.',
      'Cookieless keeps Angular clean too. You are not writing an HTTP interceptor for consent, storing a cookie via a service, or gating tracking behind a guard. Because Pulse sets no cookies and collects no personal data, there is no consent banner component and no lawful-basis logic to bake into your app — one script tag replaces all of it.',
    ],
    link: { label: 'How cookieless analytics works', href: '/cookieless-analytics' },
  },
  svelte: {
    heading: 'Why cookieless analytics fits Svelte',
    paragraphs: [
      'Svelte and SvelteKit are built around shipping as little JavaScript as possible, and a two-kilobyte async analytics script honours that budget. Drop it into `app.html` and it tracks SvelteKit’s client-side navigations without a store or a lifecycle hook — it never touches your compiled component output, so your bundle stays lean.',
      'Cookieless is a natural fit for that minimalist ethos. There is no consent store to create, no `$state` for an accept flag, and no banner component undermining your carefully small payload. Pulse collects no personal data and needs no banner, so the lightest analytics option is also the one with the least to wire up.',
    ],
    link: { label: 'How cookieless analytics works', href: '/cookieless-analytics' },
  },
  laravel: {
    heading: 'Why cookieless analytics fits Laravel',
    paragraphs: [
      'Laravel serves rendered HTML from Blade, so analytics belongs in the layout, not in a client bundle. Add the Pulse script once to your main Blade layout and every server-rendered page carries it — a couple of kilobytes, loaded async, with no impact on your response time and no client-side state to manage.',
      'Cookieless suits a server-rendered PHP app well. You are not setting an analytics cookie through Laravel’s cookie handling, adding consent middleware, or rendering a banner partial on every view. Pulse collects no personal data and needs no consent, which for an EU-facing Laravel app removes the compliance layer rather than configuring it.',
    ],
    link: { label: 'GDPR-compliant analytics', href: '/gdpr-compliant-analytics' },
  },
  django: {
    heading: 'Why cookieless analytics fits Django',
    paragraphs: [
      'Django renders templates server-side, so the Pulse tag goes straight into your `base.html` and is inherited by every page that extends it. It is one small async script — no static-asset pipeline changes, no extra app to install, and no per-request work in your views.',
      'Django already ships session and CSRF cookies with care; a cookieless analytics tool means you are not adding another cookie, wiring consent middleware, or building a banner into your base template. Pulse collects no personal data, so there is no lawful-basis decision to encode and no consent app to maintain — a clean fit for privacy-conscious Django projects.',
    ],
    link: { label: 'EU web analytics', href: '/eu-web-analytics' },
  },
  rails: {
    heading: 'Why cookieless analytics fits Rails',
    paragraphs: [
      'Rails renders from `application.html.erb`, and that layout is the natural home for the Pulse tag — add it once and every page inherits it. The script is a couple of kilobytes loaded async, and it registers pageviews across Turbo and Hotwire navigations, so a Turbo-driven app is measured correctly without extra Stimulus controllers.',
      'Cookieless keeps things idiomatic. You are not reaching for `cookies` in a controller, adding a consent concern, or rendering a banner partial in the layout. Pulse sets no cookies and collects no personal data, so the whole consent surface — and the compliance work behind it — never has to exist in your Rails app.',
    ],
    link: { label: 'How cookieless analytics works', href: '/cookieless-analytics' },
  },
  astro: {
    heading: 'Why cookieless analytics fits Astro',
    paragraphs: [
      'Astro ships zero JavaScript by default and renders mostly static HTML, so a heavyweight analytics tag would be badly out of place. Pulse’s couple-of-kilobytes async script is about the only client-side JavaScript a content site needs, and because Astro output is static and cacheable, there is no per-visitor cookie to break your CDN caching.',
      'That static, privacy-first posture pairs perfectly with cookieless measurement. You are not hydrating a consent island, storing an accept flag, or shipping a banner component that would blow past Astro’s minimal-JS philosophy. Pulse collects no personal data and needs no banner, so your fast, static Astro site stays fast, static, and lawful.',
    ],
    link: { label: 'How cookieless analytics works', href: '/cookieless-analytics' },
  },
}

export function getIntegrationDeepDive(slug: string): IntegrationDeepDive | undefined {
  return integrationDeepDives[slug]
}
